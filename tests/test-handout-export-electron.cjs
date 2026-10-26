'use strict';
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const JSZip = require('jszip');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-zip-ui-'));
  let application;
  try {
    const documentPath = path.join(root, 'lesson.md');
    const zipPath = path.join(root, 'lesson.zip');
    await fs.writeFile(documentPath, '# Saved lesson\n\n![Pond](pond.svg)');
    await fs.writeFile(path.join(root, 'pond.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + path.join(root, 'profile')], env, timeout: 15000 });
    const page = await application.firstWindow(); page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForLoadState('load');
    await application.evaluate(({ dialog, BrowserWindow }, root) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
      global.zipDialogCalls = [];
      dialog.showSaveDialog = async (_window, options) => { global.zipDialogCalls.push(options); return { canceled: false, filePath: root + '/lesson.zip' }; };
      BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open-folder' });
    }, root);
    await page.locator('#file-tree').getByRole('button', { name: 'lesson.md', exact: true }).click();
    const draft = '# Edited lesson\n\n![Pond](pond.svg)';
    await page.locator('#source').fill(draft);
    const exportFromMenu = () => application.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu().items.find(item => item.label === 'File');
      const item = file.submenu.items.find(item => item.label === 'Export ZIP…');
      if (!item) throw Error('Missing Export ZIP menu item');
      item.click();
    });
    await exportFromMenu();
    await page.getByText('ZIP exported with 1 linked asset', { exact: true }).waitFor();
    const zip = await JSZip.loadAsync(await fs.readFile(zipPath), { checkCRC32: true });
    assert.deepEqual(Object.keys(zip.files).sort(), ['lesson.md', 'pond.svg']);
    assert.equal(await zip.file('lesson.md').async('string'), draft);
    assert.equal(await fs.readFile(documentPath, 'utf8'), '# Saved lesson\n\n![Pond](pond.svg)');
    assert.match(await page.locator('.document-tab.active').innerText(), /\*/);
    assert.equal(await application.evaluate(() => global.zipDialogCalls[0].defaultPath), 'lesson.zip');

    const original = await fs.readFile(zipPath);
    await application.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    await page.locator('#source').fill(draft + '\n\nCanceled draft');
    await exportFromMenu();
    // Invoke the same bridge to ensure cancellation has completed before checking disk.
    assert.equal(await page.evaluate(([documentPath, content]) => window.handoutDesktop.exportZip(documentPath, content), [documentPath, draft]), null);
    assert.deepEqual(await fs.readFile(zipPath), original);

    await page.locator('#source').fill('# Missing\n\n![Image](missing.png)');
    await exportFromMenu();
    await page.locator('#status').filter({ hasText: 'missing.png' }).waitFor();
    assert.deepEqual(await fs.readFile(zipPath), original);
    assert.deepEqual(errors, []);
    console.log('Native Electron ZIP menu, current draft, linked assets, cancellation, and error reporting passed');
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
