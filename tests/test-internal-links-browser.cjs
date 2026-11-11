'use strict';
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const model = require('../renderer/slides');
const deck = '---\ntype: slides\n---\n# Start\n\nChoose a task.\n\n[Practice](#practice) and [Last](#slide-3).\n\n---\n# Practice\n\n[Back](#start)\n\n:::notes\nPrivate practice notes\n:::\n\n---\n:::text x=10% y=20% width=80% size=32\nFinal task\n:::\n';
const handout = '# Handout\n\n[Next](#practice)\n\n' + 'Some reading for the class.\n\n'.repeat(50) + '## Practice\n\n[Back](#handout)\n';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=';
(async () => {
  let browser, application, temp, page;
  try {
    let lesson;
    if (process.env.NATIVE_ELECTRON) {
      temp = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-links-')); lesson = path.join(temp, 'lesson'); await fs.mkdir(lesson);
      await fs.writeFile(path.join(lesson, 'deck.md'), deck); await fs.writeFile(path.join(lesson, 'handout.md'), handout);
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      application = await playwright._electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + path.join(temp, 'profile')], env, timeout: 15000 });
      page = await application.firstWindow(); await page.waitForLoadState('load');
      await application.evaluate(({ dialog, BrowserWindow }, lesson) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [lesson] }); BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open-folder' }); }, lesson);
    } else {
      browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
      page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.addInitScript(({ deck, handout, png }) => {
        const snapshot = () => ({ path: '/work', name: 'work', assets: [], tree: ['deck.md', 'handout.md'].map(name => ({ type: 'file', markdown: true, name, path: '/work/' + name })) });
        window.handoutDesktop = { onMenuCommand: callback => window.menu = callback, openFolder: async () => snapshot(), refreshFolder: async () => snapshot(), readFile: async file => file.endsWith('deck.md') ? deck : handout, setDocumentMode: async () => {}, setPresentation: async () => {}, importImage: async () => ({ path: '/work/images/image-test.png', relative: 'images/image-test.png', url: 'data:image/png;base64,' + png }) };
      }, { deck, handout, png });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../renderer/index.html')).href); await page.evaluate(() => window.menu({ command: 'open-folder' }));
    }
    page.setDefaultTimeout(12000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const insertInternalLink = async () => application ? application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('insert-internal-link').click()) : page.evaluate(() => window.menu({ command: 'insert-content', payload: 'internal-link' }));
    const source = page.locator('#source'), cards = page.locator('#preview .slide-card'), thumbnails = page.locator('.slide-outline button[data-slide-index]');
    await page.getByRole('button', { name: 'deck.md', exact: true }).click(); await cards.waitFor();
    await page.locator('#preview a[href="#practice"]').click(); assert.equal(await cards.getAttribute('data-slide-index'), '1');
    await page.locator('#preview a[href="#start"]').click(); assert.equal(await cards.getAttribute('data-slide-index'), '0');
    assert.equal(await source.inputValue(), deck, 'Following links does not edit source');
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const presentation = page.locator('.slide-presentation'); await presentation.locator('a[href="#practice"]').click(); assert.equal(await presentation.getAttribute('data-slide-index'), '1');
    await presentation.locator('a[href="#start"]').click(); await presentation.locator('a[href="#slide-3"]').click(); assert.equal(await presentation.getAttribute('data-slide-index'), '2');
    await page.keyboard.press('Escape'); await presentation.waitFor({ state: 'detached' });
    await thumbnails.nth(1).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Duplicate slide' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.slide-outline button[data-slide-index]').length === 4);
    assert.equal(await cards.getAttribute('data-slide-index'), '2');
    const duplicated = model.parse(await source.inputValue()); assert.equal(duplicated.slides[1].notes, duplicated.slides[2].notes);
    await page.keyboard.press('Control+z'); await page.waitForFunction(original => document.querySelector('#source').value === original, deck);
    await page.keyboard.press('Control+Shift+z'); await page.waitForFunction(() => document.querySelectorAll('.slide-outline button[data-slide-index]').length === 4);
    await page.keyboard.press('Control+z'); await page.waitForFunction(original => document.querySelector('#source').value === original, deck);
    await thumbnails.first().click();
    await source.evaluate(node => { const start = node.value.indexOf('Choose a task.'); node.setSelectionRange(start, start + 'Choose a task.'.length); });
    await insertInternalLink();
    await page.getByLabel('Link destination', { exact: true }).selectOption('practice'); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(await source.inputValue(), deck);
    await insertInternalLink(); await page.getByLabel('Link destination', { exact: true }).selectOption('practice'); await page.getByLabel('Link text', { exact: true }).fill('Go practice'); await page.getByRole('button', { name: 'Insert link', exact: true }).click();
    assert((await source.inputValue()).includes('[Go practice](#practice)')); await page.keyboard.press('Control+z'); await page.waitForFunction(original => document.querySelector('#source').value === original, deck);
    await page.getByRole('button', { name: 'handout.md', exact: true }).click();
    await page.locator('.unsaved-dialog').getByRole('button', { name: 'Discard', exact: true }).click();
    await page.locator('#preview h2#practice').waitFor();
    await page.locator('#preview a[href="#practice"]').click(); assert.equal(await page.locator('#preview h2#practice').evaluate(node => node === document.activeElement), true);
    assert(await page.locator('.preview-panel').evaluate(node => node.scrollTop > 0));
    await insertInternalLink(); assert.deepEqual(await page.getByLabel('Link destination', { exact: true }).locator('option').allTextContents(), ['Handout', 'Practice']); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Present', exact: true }).click(); const handoutPresentation = page.locator('.handout-presentation'); await handoutPresentation.locator('a[href="#practice"]').click(); assert(await handoutPresentation.locator('.handout-presentation-viewport').evaluate(node => node.scrollTop > 0));
    await handoutPresentation.locator('a[href="#handout"]').click();
    await page.waitForFunction(() => { const viewport = document.querySelector('.handout-presentation-viewport'), heading = viewport.querySelector('[data-presentation-anchor="handout"]'); return Math.abs(heading.getBoundingClientRect().top - viewport.getBoundingClientRect().top) < 5; });
    await page.keyboard.press('Escape'); await handoutPresentation.waitFor({ state: 'detached' });
    await source.evaluate((node, png) => { node.focus(); node.setSelectionRange(node.value.length, node.value.length); const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob(png), ch => ch.charCodeAt(0))], 'clipboard.png', { type: 'image/png' })); node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })); }, png);
    await page.waitForFunction(() => /!\[[^\]]*\]\(images\/image-[^)]+\.png\)/.test(document.querySelector('#source').value));
    if (lesson) { const images = await fs.readdir(path.join(lesson, 'images')); assert.equal(images.length, 1); assert.deepEqual(await fs.readFile(path.join(lesson, 'images', images[0])), Buffer.from(png, 'base64')); }
    await page.screenshot({ path: '/tmp/handout-internal-links.png' }); assert.deepEqual(errors, []);
    console.log('Internal link picker, preview and presentation jumps, duplicate Undo/Redo, handout anchors and image-folder paste passed' + (lesson ? ' in native Electron' : ''));
  } catch (error) {
    if (page) { console.error(await page.locator('#preview').evaluate(node => ({ headings: [...node.querySelectorAll('h1,h2')].map(h => h.outerHTML), status: document.querySelector('#status').textContent })).catch(() => null)); await page.screenshot({ path: '/tmp/handout-internal-links-failure.png' }).catch(() => {}); }
    throw error;
  } finally { if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {}); if (browser) await browser.close(); if (temp) await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
