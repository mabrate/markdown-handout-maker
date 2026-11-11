'use strict';
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises'), path = require('path'), os = require('os'), assert = require('assert/strict');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-session-native-'));
  const root = path.join(temp, 'lessons'), profile = path.join(temp, 'profile'), sub = path.join(root, 'Subfolder');
  const first = path.join(root, 'one.md'), second = path.join(sub, 'two.md'), sessionFile = path.join(profile, 'workspace-session.json');
  const paragraphs = Array.from({ length: 70 }, (_, index) => `Paragraph ${index + 1}: This saved handout has enough text to remember the editor and preview reading position.`).join('\n\n');
  const secondSaved = '# Two\n\n' + paragraphs, secondUpdated = '# Two\n\nChanged outside the app.\n\n' + paragraphs;
  await fs.mkdir(sub, { recursive: true }); await fs.writeFile(first, '# One\n\nSaved first file.'); await fs.writeFile(second, secondSaved);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let application;
  const launch = async () => {
    application = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + profile], env, timeout: 15000 });
    const page = await application.firstWindow(); page.setDefaultTimeout(10000); await page.waitForLoadState('load'); return page;
  };
  const command = (command, payload) => application.evaluate(({ BrowserWindow }, message) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', message), { command, payload });
  const close = async () => { await application.close(); application = null; };
  const promptFor = page => page.getByRole('dialog', { name: 'Restore previous session', exact: true });
  try {
    let page = await launch(); assert.equal(await page.locator('dialog[open]').count(), 0);
    await application.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); }, root);
    await command('open-folder');
    const tree = page.locator('#file-tree');
    await tree.getByRole('button', { name: 'one.md', exact: true }).click();
    await tree.locator('summary').click(); await tree.getByRole('button', { name: 'two.md', exact: true }).click();
    await page.locator('.document-tab.active').filter({ hasText: 'two.md' }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.locator('#source').evaluate(node => { node.setSelectionRange(3, 7); node.scrollTop = 180; });
    await page.locator('.preview-panel').evaluate(node => { node.scrollTop = 300; });
    await close();
    const originalSession = await fs.readFile(sessionFile, 'utf8'); assert.equal(JSON.parse(originalSession).documents.length, 2);
    assert.equal(JSON.parse(originalSession).documents.find(document => document.path === second).selectionStart, 3);
    assert.equal(JSON.parse(originalSession).documents.find(document => document.path === second).previewScrollTop, 300);
    await fs.writeFile(second, secondUpdated);
    page = await launch(); await promptFor(page).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), 'handout-workspace-session-prompt.png') });
    assert.equal(await fs.readFile(sessionFile, 'utf8'), originalSession, 'Pending offer preserves the previous session');
    await close();
    page = await launch(); await promptFor(page).getByRole('button', { name: 'Restore session', exact: true }).click();
    await promptFor(page).waitFor({ state: 'detached' });
    assert.equal(await page.locator('.document-tab').count(), 2);
    assert.equal(await page.locator('#source').inputValue(), secondUpdated);
    assert.deepEqual(await page.locator('#source').evaluate(node => [node.selectionStart, node.selectionEnd]), [3, 7]);
    await page.waitForFunction(() => document.querySelector('.preview-panel').scrollTop === 300);
    assert.equal(await page.locator('#source').evaluate(node => node.scrollTop), 180);
    assert.equal(await page.locator('#file-tree details').evaluate(node => node.open), true);

    // A clean active tab and an inactive draft restore together in one offer.
    await page.locator('.document-tab-label').filter({ hasText: 'one.md' }).click();
    await page.locator('#source').fill('# Protected draft');
    await page.locator('.document-tab-label').filter({ hasText: 'two.md' }).click();
    await close();
    page = await launch(); const recovery = page.getByRole('dialog', { name: 'Recover unsaved work', exact: true });
    await recovery.getByRole('button', { name: 'Restore files', exact: true }).click(); await recovery.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.document-tab').count(), 2);
    assert.equal(await page.locator('#source').inputValue(), secondUpdated);
    await page.locator('.document-tab-label').filter({ hasText: 'one.md' }).click();
    assert.equal(await page.locator('#source').inputValue(), '# Protected draft');
    await command('save'); await page.waitForFunction(() => !document.querySelector('.document-tab.active').innerText.includes('*'));
    await page.getByRole('button', { name: 'Close one.md', exact: true }).click(); await close();
    page = await launch(); await promptFor(page).getByRole('button', { name: 'Restore session', exact: true }).click();
    await promptFor(page).waitFor({ state: 'detached' });
    assert.equal(await page.locator('.document-tab').count(), 1, 'Closed tabs stay closed'); await close();
    await fs.unlink(second);
    page = await launch(); await promptFor(page).getByRole('button', { name: 'Restore session', exact: true }).click();
    await promptFor(page).waitFor({ state: 'detached' });
    assert.match(await page.locator('.recovery-status').innerText(), /Unavailable items skipped/);
    assert.equal(await page.locator('#folder-name').innerText(), 'lessons'); await close();
    // Folder-only sessions also offer restore. Declining clears the next offer.
    page = await launch(); await promptFor(page).getByRole('button', { name: 'Restore session', exact: true }).click();
    await promptFor(page).waitFor({ state: 'detached' });
    assert.equal(await page.locator('#folder-name').innerText(), 'lessons');
    assert.equal(await page.locator('#file-tree').getByRole('button', { name: 'one.md', exact: true }).count(), 1); await close();
    page = await launch(); await promptFor(page).getByRole('button', { name: 'Start fresh', exact: true }).click();
    await promptFor(page).waitFor({ state: 'detached' }); await close();
    page = await launch(); assert.equal(await page.locator('dialog[open]').count(), 0); await close();
    console.log('Native session restart, pending offer, saved tabs, active selection, expanded folders, combined draft recovery, closed/missing files, folder-only restore, and Start fresh checks passed');
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
