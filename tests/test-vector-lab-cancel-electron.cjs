'use strict';
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises'), path = require('path'), os = require('os'), assert = require('assert/strict');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-vector-cancel-'));
  const root = path.join(temp, 'lesson'), image = path.join(root, 'art.svg'), documentPath = path.join(root, 'lesson.md');
  const original = '# Cancel drawing\n\n![Art](art.svg)\n';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="red"/></svg>';
  await fs.mkdir(root); await fs.writeFile(documentPath, original); await fs.writeFile(image, svg);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let application;
  try {
    application = await _electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + path.join(temp, 'profile')], env, timeout: 15000 });
    const page = await application.firstWindow(); page.setDefaultTimeout(10000); await page.waitForLoadState('load');
    await application.evaluate(({ dialog, BrowserWindow }, root) => {
      globalThis.cancelChoice = 0; globalThis.cancelMessages = [];
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
      dialog.showMessageBoxSync = (_window, options) => { globalThis.cancelMessages.push(options.message); return globalThis.cancelChoice; };
      BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open-folder' });
    }, root);
    await page.locator('#file-tree').getByRole('button', { name: 'lesson.md', exact: true }).click();
    await page.waitForFunction(original => document.querySelector('#source').value === original, original);
    const openDrawing = async () => {
      const opening = application.waitForEvent('window');
      await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('insert-drawing').click());
      const editor = await opening; editor.setDefaultTimeout(10000); await editor.waitForFunction(() => window.handoutVectorLabConnected && [...document.querySelectorAll('button')].some(button => button.textContent === 'Insert into document' && !button.disabled)); return editor;
    };
    const cancel = async editor => { await Promise.all([editor.waitForEvent('close'), editor.getByRole('button', { name: 'Cancel', exact: true }).click()]); };
    const unchanged = async () => {
      assert.equal(await page.locator('#source').inputValue(), original);
      assert.equal(await fs.readFile(documentPath, 'utf8'), original); assert.equal(await fs.readFile(image, 'utf8'), svg);
      assert.deepEqual((await fs.readdir(root)).sort(), ['art.svg', 'lesson.md']);
    };
    const draw = async editor => {
      await editor.locator('[data-tool="rectangle"]').click();
      const box = await editor.locator('#canvas').boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      await editor.mouse.move(x - 50, y - 30); await editor.mouse.down(); await editor.mouse.move(x + 50, y + 30, { steps: 6 }); await editor.mouse.up();
    };
    let editor = await openDrawing();
    await editor.screenshot({ path: path.join(os.tmpdir(), 'handout-vector-lab-cancel.png') });
    await cancel(editor); await unchanged();
    assert.deepEqual(await application.evaluate(() => globalThis.cancelMessages), [], 'An untouched blank drawing closes directly');

    editor = await openDrawing(); await draw(editor);
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await application.evaluate(() => new Promise((resolve, reject) => {
      let attempts = 0; const timer = setInterval(() => {
        if (globalThis.cancelMessages.length) { clearInterval(timer); resolve(); }
        else if (++attempts > 100) { clearInterval(timer); reject(Error('No discard confirmation')); }
      }, 25);
    }));
    assert.equal(editor.isClosed(), false, 'Keep editing preserves the window');
    await editor.getByRole('button', { name: 'Insert into document', exact: true }).waitFor(); await unchanged();
    await application.evaluate(() => { globalThis.cancelChoice = 1; });
    await cancel(editor); await unchanged();
    assert.deepEqual(await application.evaluate(() => globalThis.cancelMessages), ['Discard unsaved image changes?', 'Discard unsaved image changes?']);

    // Cancel an edit to an existing image without saving back or changing its links.
    const opening = application.waitForEvent('window');
    await page.locator('#preview img').click({ button: 'right' }); await page.getByRole('button', { name: 'Edit in Vector Lab', exact: true }).click();
    editor = await opening; editor.setDefaultTimeout(10000);
    await editor.waitForFunction(() => window.handoutVectorLabConnected && [...document.querySelectorAll('button')].some(button => button.textContent === 'Save back to slideshow' && !button.disabled));
    await draw(editor); await cancel(editor); await unchanged();
    console.log('Native Vector Lab Cancel closes blank drawings, preserves Keep editing, discards new/existing edits, and leaves image files and Markdown unchanged');
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
