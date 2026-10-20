'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      let extra = [];
      const snapshot = () => ({ path: '/work', name: 'work', assets: [], tree: [
        { type: 'folder', path: '/work/Lessons', name: 'Lessons', children: [
          { type: 'folder', path: '/work/Lessons/Unit', name: 'Unit', children: [] },
          { type: 'file', path: '/work/Lessons/first.md', name: 'first.md', markdown: true }
        ] },
        { type: 'folder', path: '/work/Archive', name: 'Archive', children: [] }, ...extra
      ] });
      window.addExternal = name => { extra.push({ type: 'file', path: '/work/' + name, name, markdown: true }); };
      window.removeExternal = () => { extra = []; };
      window.handoutDesktop = {
        onMenuCommand: callback => { window.menu = callback; },
        openFolder: async () => snapshot(), openRecentFolder: async () => snapshot(), refreshFolder: async () => snapshot(),
        readFile: async () => '# Original'
      };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
    await page.evaluate(() => window.menu({ command: 'open-folder' }));
    const lessons = page.locator('details[data-folder-path="/work/Lessons"]');
    const unit = page.locator('details[data-folder-path="/work/Lessons/Unit"]');
    const archive = page.locator('details[data-folder-path="/work/Archive"]');
    assert.equal(await lessons.evaluate(el => el.open), false);
    await lessons.locator(':scope > summary').click();
    await unit.locator(':scope > summary').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('handout-folder-expansion-v1:/work')).includes('/work/Lessons/Unit'));
    // Temporary search expansion must not persist Archive's open state.
    await page.getByRole('searchbox').fill('first'); await page.getByRole('searchbox').fill('');
    assert.equal(await archive.evaluate(el => el.open), false);
    await page.reload(); await page.evaluate(() => window.menu({ command: 'open-recent-folder', payload: '/work' }));
    assert.equal(await lessons.evaluate(el => el.open), true);
    assert.equal(await unit.evaluate(el => el.open), true);
    assert.equal(await archive.evaluate(el => el.open), false);
    await page.locator('#file-tree').getByRole('button', { name: 'first.md', exact: true }).click();
    await page.locator('#source').fill('# Unsaved work');
    await page.evaluate(() => window.addExternal('new.md'));
    await page.locator('#file-tree').getByRole('button', { name: 'new.md', exact: true }).waitFor({ timeout: 6000 });
    assert.equal(await page.locator('#source').inputValue(), '# Unsaved work');
    assert.equal(await page.locator('.file-entry.unsaved').count(), 1);
    assert.equal(await unit.evaluate(el => el.open), true);
    await page.evaluate(() => window.removeExternal());
    await page.locator('#file-tree').getByRole('button', { name: 'new.md', exact: true }).waitFor({ state: 'detached', timeout: 6000 });
    await lessons.locator(':scope > summary').click({ button: 'right' });
    await page.getByRole('button', { name: 'New handout', exact: true }).click();
    const nameInput = page.getByRole('textbox', { name: 'New handout name' });
    await nameInput.fill('Keep my filename'); await page.evaluate(() => window.addExternal('later.md'));
    await page.waitForTimeout(2400);
    assert.equal(await nameInput.inputValue(), 'Keep my filename');
    await nameInput.press('Escape');
    await page.locator('#file-tree').getByRole('button', { name: 'later.md', exact: true }).waitFor({ timeout: 6000 });
    // Explicitly collapsed folders remain collapsed after the next session.
    await unit.locator(':scope > summary').click();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('handout-folder-expansion-v1:/work')).includes('/work/Lessons/Unit'));
    // Accept the test reload's unsaved-changes prompt.
    page.on('dialog', dialog => dialog.accept());
    await page.reload(); await page.evaluate(() => window.menu({ command: 'open-recent-folder', payload: '/work' }));
    assert.equal(await lessons.evaluate(el => el.open), true);
    assert.equal(await unit.evaluate(el => el.open), false);
    // A different root starts with its own collapsed state.
    await page.evaluate(() => {
      window.handoutDesktop.openRecentFolder = async root => ({ path: root, name: 'other', assets: [], tree: [
        { type: 'folder', path: root + '/Lessons', name: 'Lessons', children: [] }
      ] });
    });
    await page.evaluate(() => window.menu({ command: 'open-recent-folder', payload: '/other' }));
    assert.equal(await page.locator('details[data-folder-path="/other/Lessons"]').evaluate(el => el.open), false);
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('handout-folder-expansion-v1:/work')).includes('/work/Lessons')));
    assert.deepEqual(errors, []);
    console.log('Automatic file refresh and persistent folder expansion UI checks passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
