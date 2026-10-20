'use strict';
// Optional UI check: install Playwright, or set PLAYWRIGHT_MODULE to an existing installation.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.actions = [];
      let extracted = false;
      const snapshot = () => ({ path: '/work', name: 'work', assets: [], tree: [
        { type: 'folder', path: '/work/Lessons', name: 'Lessons', children: [] },
        { type: 'file', path: '/work/handout.md', name: 'handout.md', markdown: true },
        { type: 'file', path: '/work/image.png', name: 'image.png', image: true },
        { type: 'file', path: '/work/scores.csv', name: 'scores.csv' },
        { type: 'file', path: '/work/lesson.zip', name: 'lesson.zip' },
        ...(extracted ? [{ type: 'folder', path: '/work/lesson', name: 'lesson', children: [{ type: 'file', name: 'notes.txt', path: '/work/lesson/notes.txt' }] }] : [])
      ] });
      window.handoutDesktop = {
        previewDocument: async () => ({ kind: 'sheets', sheets: [{ name: 'Scores', rows: [['Name', 'Score'], ['Ada', '3']] }] }),
        startFileDrag: value => window.actions.push(['drag', value]),
        readGuide: async () => '# AI syntax guide',
        platform: 'darwin', onMenuCommand: callback => { window.menu = callback; },
        openFolder: async () => snapshot(), refreshFolder: async () => snapshot(),
        revealItem: async value => { window.actions.push(['reveal', value]); },
        openExternalFile: async value => { window.actions.push(['open', value]); if (window.failOpen) throw Error('No application is associated with this file.'); },
        extractZip: async value => { window.actions.push(['extract', value]); extracted = true; return { path: '/work/lesson', name: 'lesson' }; }
      };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
    await page.evaluate(() => window.menu({ command: 'open-folder' }));
    const tree = page.locator('#file-tree');
    assert.equal(await tree.locator('.file-drag-handle').count(), 0);
    const markdown = tree.getByRole('button', { name: 'handout.md', exact: true });
    await markdown.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
    assert.deepEqual(await page.evaluate(() => window.actions.pop()), ['drag', '/work/handout.md']);
    const csv = tree.getByRole('button', { name: 'scores.csv', exact: true });
    await csv.dblclick();
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['open', '/work/scores.csv']);
    await csv.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.actions.length), 2);
    await csv.click({ button: 'right' }); await page.getByRole('button', { name: 'Show in Finder', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['reveal', '/work/scores.csv']);
    await tree.locator('summary').filter({ hasText: 'Lessons' }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Open in Finder', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['open', '/work/Lessons']);
    await page.locator('#folder-name').click({ button: 'right' }); await page.getByRole('button', { name: 'Show in Finder', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['reveal', '/work']);
    for (const name of ['handout.md', 'image.png']) {
      await tree.getByText(name, { exact: true }).click({ button: 'right' }); await page.getByRole('button', { name: 'Show in Finder', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['reveal', '/work/' + name]);
    }
    await page.getByRole('searchbox').fill('csv');
    assert.equal(await tree.locator('.file-entry').count(), 1);
    await page.getByRole('searchbox').fill('zip');
    await tree.getByRole('button', { name: 'lesson.zip', exact: true }).click({ button: 'right' });
    await page.getByRole('button', { name: 'Extract ZIP', exact: true }).click();
    await tree.getByRole('button', { name: 'notes.txt', exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['extract', '/work/lesson.zip']);
    await page.evaluate(() => { window.failOpen = true; });
    await csv.dblclick();
    await page.getByText('Could not open item: No application is associated with this file.').waitFor();
    await page.getByRole('searchbox').fill('csv');
    await csv.click();
    await page.locator('.supporting-preview').getByText('Ada', { exact: true }).waitFor();
    await page.screenshot({ path: '/tmp/handout-supporting-preview-check.png' });
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.supporting-preview').isVisible(), false);
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('button', { name: 'Close preview' }).click();
    await csv.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
    assert.deepEqual(await page.evaluate(() => window.actions.at(-1)), ['drag', '/work/scores.csv']);
    await page.evaluate(() => window.menu({ command: 'open-handout-guide', payload: '/demo/AI_HANDOUT_GUIDE.md' }));
    await page.getByRole('textbox', { name: 'Guide text' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Guide text' }).inputValue(), '# AI syntax guide');
    await page.getByRole('button', { name: 'Close guide' }).click();
    const conversion = await page.evaluate(() => {
      const api = window.HandoutClipboard;
      return api.htmlToMarkdown('<h2>Lesson</h2><p><span style="font-weight:700">Bold</span> and <em>italic</em></p><table><tr><td>Name</td><td>Score</td></tr><tr><td>Ada</td><td>3</td></tr></table><script>alert(1)</script>');
    });
    assert.match(conversion, /## Lesson/); assert.match(conversion, /\*\*Bold\*\*/); assert.match(conversion, /\*italic\*/); assert.match(conversion, /\| Ada \| 3 \|/); assert.ok(!conversion.includes('alert'));
    await page.evaluate(() => {
      const editor = document.getElementById('source');
      editor.value = ''; editor.setSelectionRange(0, 0);
      const clipboardData = new DataTransfer(); clipboardData.setData('text/html', '<h2>Imported lesson</h2><p>Read <strong>carefully</strong>.</p>');
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    assert.match(await page.locator('#source').inputValue(), /## Imported lesson/);
    await page.evaluate(() => {
      const editor = document.getElementById('source'); editor.value = ''; editor.setSelectionRange(0, 0);
      const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', 'Name\tScore\nAda\t3');
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    assert.match(await page.locator('#source').inputValue(), /\| Ada \| 3 \|/);
    const plainPasteWasIntercepted = await page.evaluate(() => {
      const editor = document.getElementById('source');
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true }));
      const clipboardData = new DataTransfer(); clipboardData.setData('text/html', '<b>plain</b>'); clipboardData.setData('text/plain', 'plain');
      const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }); editor.dispatchEvent(event); return event.defaultPrevented;
    });
    assert.equal(plainPasteWasIntercepted, false);
    assert.deepEqual(errors, []);
    console.log('File browser external actions UI checks passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
