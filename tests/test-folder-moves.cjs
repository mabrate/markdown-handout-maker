'use strict';
// Optional native Electron check; uses an isolated profile and temporary lesson folder.
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
(async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-folder-moves-'));
  let application;
  try {
    const root = path.join(temporary, 'work'), unit = path.join(root, 'Unit');
    await fs.mkdir(path.join(unit, 'Nested'), { recursive: true });
    await fs.mkdir(path.join(root, 'Archive'));
    await fs.mkdir(path.join(root, 'Collision/Unit'), { recursive: true });
    await fs.writeFile(path.join(root, 'Collision/Unit/keep.txt'), 'Keep me');
    const lesson = '# Saved lesson\n\n![Local](../picture.png)\n\n![Shared](../../shared.png)';
    await fs.writeFile(path.join(unit, 'Nested/lesson.md'), lesson);
    await fs.writeFile(path.join(unit, 'other.md'), '# Saved other\n\n[Shared](../shared.md)');
    await fs.writeFile(path.join(root, 'outside.md'), '# Outside');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/p0AAAAASUVORK5CYII=', 'base64');
    await fs.writeFile(path.join(unit, 'picture.png'), png);
    await fs.writeFile(path.join(root, 'shared.png'), png);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({
      executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + path.join(temporary, 'profile')], env, timeout: 20000
    });
    const page = await application.firstWindow(); page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForLoadState('load');
    await application.evaluate(({ dialog, BrowserWindow }, root) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
      BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open-folder' });
    }, root);
    const tree = page.locator('#file-tree'), editor = page.locator('#source');
    const folder = value => tree.locator(`details[data-folder-path="${value}"]`);
    const summary = value => folder(value).locator(':scope > summary');
    const file = name => tree.getByRole('button', { name, exact: true });
    const tab = name => page.locator('.document-tab-label').filter({ hasText: name });
    await file('outside.md').click();
    await summary(unit).click(); await file('other.md').click();
    await summary(path.join(unit, 'Nested')).click(); await file('lesson.md').click();
    await tab('other.md').click(); await editor.fill('# Draft other\n\n[Shared](../shared.md)');
    await tab('lesson.md').click(); await editor.fill(lesson.replace('# Saved lesson', '# Draft lesson'));
    await editor.evaluate(element => element.setSelectionRange(5, 9));
    // Seed recent paths and a Google Docs association to check the IPC's metadata update.
    const settingsPath = path.join(await application.evaluate(({ app }) => app.getPath('userData')), 'settings.json');
    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    settings.googleDocs = { [path.join(unit, 'other.md')]: { id: 'test-link' } };
    settings.recentFolders.push(path.join(unit, 'Nested'));
    await fs.writeFile(settingsPath, JSON.stringify(settings));
    await summary(unit).dragTo(summary(path.join(root, 'Archive')));
    const moved = path.join(root, 'Archive/Unit');
    await folder(moved).waitFor();
    await page.getByText('Moved Unit', { exact: true }).waitFor();
    await assert.rejects(fs.access(unit));
    assert.equal(await editor.inputValue(), lesson.replace('# Saved lesson', '# Draft lesson').replace('../../shared.png', '../../../shared.png'));
    assert.deepEqual(await editor.evaluate(element => [element.selectionStart, element.selectionEnd]), [5, 9]);
    assert.equal(await page.locator('.document-tab-label').filter({ hasText: '*' }).count(), 2);
    assert.equal(await fs.readFile(path.join(moved, 'Nested/lesson.md'), 'utf8'), lesson.replace('../../shared.png', '../../../shared.png'));
    assert.ok(await folder(path.join(moved, 'Nested')).evaluate(element => element.open));
    assert.match(await page.locator('#preview img').first().getAttribute('src'), /Archive\/Unit\/picture.png$/);
    const expansion = await page.evaluate(root => JSON.parse(localStorage.getItem('handout-folder-expansion-v1:' + root)), root);
    assert.ok(expansion.includes(path.join(moved, 'Nested'))); assert.ok(!expansion.includes(unit));
    const movedSettings = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    assert.equal(movedSettings.googleDocs[path.join(moved, 'other.md')].id, 'test-link');
    assert.ok(movedSettings.recentFiles.includes(path.join(moved, 'Nested/lesson.md')));
    assert.ok(movedSettings.recentFolders.includes(path.join(moved, 'Nested')));
    await tab('other.md').click(); assert.match(await editor.inputValue(), /^# Draft other/);
    assert.ok((await editor.inputValue()).includes('../../shared.md'));
    assert.equal(await page.locator('.document-tab.active').getAttribute('title'), path.join(moved, 'other.md'));
    // Invalid descendants never highlight as destinations or fall through to the root.
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await summary(moved).dispatchEvent('dragstart', { dataTransfer: transfer });
    await summary(path.join(moved, 'Nested')).dispatchEvent('dragover', { dataTransfer: transfer });
    assert.doesNotMatch(await summary(path.join(moved, 'Nested')).getAttribute('class') || '', /drop-target/);
    await summary(moved).dispatchEvent('dragend', { dataTransfer: transfer });
    await summary(moved).dragTo(summary(path.join(root, 'Collision')));
    await page.getByText(/Could not move folder:.*already exists/).waitFor();
    assert.equal(await fs.readFile(path.join(root, 'Collision/Unit/keep.txt'), 'utf8'), 'Keep me');
    await fs.access(path.join(moved, 'Nested/lesson.md'));
    // Moving to the root also preserves an unrelated active document's draft.
    await tab('outside.md').click(); await editor.fill('# Outside draft');
    await summary(moved).dragTo(page.locator('#folder-name'));
    await folder(unit).waitFor(); await page.getByText('Moved Unit', { exact: true }).waitFor();
    assert.equal(await editor.inputValue(), '# Outside draft');
    await summary(unit).click({ button: 'right' }); await page.getByRole('button', { name: 'Move to…', exact: true }).click();
    const destinations = await page.getByRole('combobox', { name: 'Destination folder' }).locator('option').evaluateAll(options => options.map(option => option.value));
    assert.ok(!destinations.some(value => value === unit || value.startsWith(unit + path.sep)));
    await page.getByRole('combobox', { name: 'Destination folder' }).selectOption(path.join(root, 'Archive'));
    await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click();
    await folder(moved).waitFor(); await page.getByText('Moved Unit', { exact: true }).waitFor();
    assert.equal(await editor.inputValue(), '# Outside draft');
    await tab('lesson.md').click(); assert.match(await editor.inputValue(), /^# Draft lesson/);
    assert.equal(await page.locator('.document-tab.active').getAttribute('title'), path.join(moved, 'Nested/lesson.md'));
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'save' }));
    await page.waitForFunction(() => !document.querySelector('.document-tab.active').textContent.includes('*'));
    assert.match(await fs.readFile(path.join(moved, 'Nested/lesson.md'), 'utf8'), /^# Draft lesson/);
    assert.deepEqual(errors, []);
    console.log('Native folder dragging, root/context-menu moves, collisions, references, tabs, drafts, expansion, saving, and recent paths passed');
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
