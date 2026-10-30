'use strict';
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises'), path = require('path'), os = require('os'), assert = require('assert/strict');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-recovery-native-'));
  const root = path.join(temp, 'lessons'), profile = path.join(temp, 'profile'), file = path.join(root, 'lesson.md');
  const recoveryFile = path.join(profile, 'recovery', 'unsaved-work.json');
  await fs.mkdir(root); await fs.writeFile(file, '# Original\n\nSaved content.');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let application;
  const launch = async () => {
    application = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + profile], env, timeout: 15000 });
    const page = await application.firstWindow(); page.setDefaultTimeout(10000); await page.waitForLoadState('load'); return page;
  };
  const command = (command, payload) => application.evaluate(({ BrowserWindow }, message) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', message), { command, payload });
  try {
    let page = await launch();
    await application.evaluate(({ dialog }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); }, root);
    await command('open-folder');
    await page.locator('#file-tree').getByRole('button', { name: 'lesson.md', exact: true }).click();
    const draft = '# Original\n\nLatest unsaved text.';
    await page.locator('#source').fill(draft); await page.locator('#source').evaluate(node => node.setSelectionRange(4, 9));
    await command('new-slides'); await page.waitForFunction(() => document.querySelector('#source').value.includes('type: slides'));
    const newSlides = '---\ntype: slides\n---\n# Unsaved new slides'; await page.locator('#source').fill(newSlides);
    await command('new-handout'); await page.waitForFunction(() => !document.querySelector('#source').value.includes('Unsaved new slides'));
    const protectedDrafts = JSON.parse(await fs.readFile(recoveryFile, 'utf8'));
    assert.equal(protectedDrafts.documents.length, 2); assert(protectedDrafts.documents.some(document => document.content === draft));
    assert.equal(protectedDrafts.documents.find(document => document.path === file).selectionStart, 4);
    await application.close(); application = null;
    assert.equal(await fs.readFile(file, 'utf8'), '# Original\n\nSaved content.');

    page = await launch(); const prompt = page.getByRole('dialog', { name: 'Recover unsaved work', exact: true }); await prompt.waitFor();
    assert.match(await prompt.innerText(), /2 documents/);
    assert.equal(JSON.parse(await fs.readFile(recoveryFile, 'utf8')).documents.length, 2, 'Startup does not erase pending drafts');
    await prompt.getByRole('button', { name: 'Restore files', exact: true }).click(); await prompt.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#source').inputValue(), draft);
    assert.deepEqual(await page.locator('#source').evaluate(node => [node.selectionStart, node.selectionEnd]), [4, 9]);
    assert.equal(await page.locator('.document-tab').count(), 2);
    await command('save'); await page.waitForFunction(() => !document.querySelector('.document-tab.active').innerText.includes('*'));
    assert.equal(await fs.readFile(file, 'utf8'), draft);
    assert.equal(JSON.parse(await fs.readFile(recoveryFile, 'utf8')).documents.length, 1);
    await page.locator('.document-tab-label').filter({ hasText: 'new-slides.md' }).click();
    assert.equal(await page.locator('#source').inputValue(), newSlides);
    await application.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    await command('save');
    assert.equal(JSON.parse(await fs.readFile(recoveryFile, 'utf8')).documents.length, 1, 'Canceled Save keeps recovery');
    await application.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, path.join(root, 'slides.md'));
    await command('save'); await page.waitForFunction(() => !document.querySelector('.document-tab.active').innerText.includes('*'));
    await assert.rejects(fs.access(recoveryFile), /ENOENT/);
    await application.close(); application = null;

    page = await launch(); assert.equal(await page.getByRole('dialog', { name: 'Recover unsaved work', exact: true }).count(), 0);
    await command('open-recent', file); await page.waitForFunction(() => document.querySelector('#source').value.includes('Latest unsaved text.'));
    const conflictDraft = '# My draft before a crash'; await page.locator('#source').fill(conflictDraft);
    const child = application.process(), exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; application = null;
    await fs.writeFile(file, '# Newer external version');
    page = await launch(); const conflictPrompt = page.getByRole('dialog', { name: 'Recover unsaved work', exact: true }); await conflictPrompt.waitFor();
    await conflictPrompt.getByRole('button', { name: 'Restore files', exact: true }).click(); await conflictPrompt.waitFor({ state: 'detached' });
    assert.equal(await page.locator('#source').inputValue(), conflictDraft);
    assert.match(await page.locator('.document-tab.active').innerText(), /lesson-recovered\.md/);
    assert.match(await page.locator('.recovery-status').innerText(), /separate copy/);
    assert.equal(await fs.readFile(file, 'utf8'), '# Newer external version');
    await application.close(); application = null;
    page = await launch(); const discardPrompt = page.getByRole('dialog', { name: 'Recover unsaved work', exact: true }); await discardPrompt.waitFor();
    await discardPrompt.getByRole('button', { name: 'Discard recovery', exact: true }).click(); await discardPrompt.waitFor({ state: 'detached' });
    await assert.rejects(fs.access(recoveryFile), /ENOENT/);
    assert.equal(await fs.readFile(file, 'utf8'), '# Newer external version');
    await fs.mkdir(recoveryFile);
    await page.locator('#source').fill('# Keep this draft');
    await page.locator('.recovery-status.recovery-error').waitFor();
    await application.evaluate(({ dialog, BrowserWindow }) => { dialog.showMessageBoxSync = () => 0; BrowserWindow.getAllWindows()[0].close(); });
    assert.equal(await page.locator('#source').inputValue(), '# Keep this draft', 'A failed recovery keeps the window open');
    console.log('Native recovery survives normal close and forced termination, restores inactive/untitled tabs and selection, protects externally changed originals, and handles Save, Cancel, Discard and write failure');
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
