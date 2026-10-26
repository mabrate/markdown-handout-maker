'use strict';
// Optional UI checks using an existing Playwright installation.
const { _electron, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-present-'));
  let application, browser;
  try {
    const documentPath = path.join(root, 'lesson.md');
    const content = '# Explore a pond\n\nLook for plants and animals.\n\n![Pond](pond.svg){width=3in}\n\n[video:clip.webm]{width=3in}\n\n:::pagebreak\n\n# Record observations\n\nDescribe what you noticed.\n\n{{lines:6}}\n\n:::pagebreak\n\n# Share findings\n\nCompare your observations.';
    await fs.writeFile(documentPath, content);
    await fs.copyFile(path.join(__dirname, '../demo/pond-example.svg'), path.join(root, 'pond.svg'));
    await fs.copyFile(path.join(__dirname, 'fixtures/video.webm'), path.join(root, 'clip.webm'));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + path.join(root, 'profile')], env, timeout: 15000 });
    const page = await application.firstWindow(); page.setDefaultTimeout(12000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForLoadState('load');
    await application.evaluate(({ dialog, BrowserWindow }, root) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
      BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open-folder' });
    }, root);
    await page.locator('#file-tree').getByRole('button', { name: 'lesson.md', exact: true }).click();
    await page.locator('#preview > .handout-page').nth(2).waitFor();
    const draft = content + '\n\nUnsaved observation.';
    await page.locator('#source').fill(draft);
    await page.locator('#preview').getByText('Unsaved observation.', { exact: true }).waitFor();
    await page.locator('#preview img').click();
    await page.getByLabel('Handout settings', { exact: true }).waitFor();
    const before = await page.evaluate(() => {
      const workspace = document.querySelector('.workspace'), source = document.querySelector('#source');
      workspace.style.setProperty('--file-width', '210px'); workspace.style.setProperty('--editor-width', '440px');
      document.querySelector('.panel-toggle[data-panel="file"]').click();
      source.setSelectionRange(12, 26); source.scrollTop = 70;
      return { classes: workspace.className, style: workspace.getAttribute('style'), start: source.selectionStart, end: source.selectionEnd, top: source.scrollTop };
    });
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const presentation = page.getByRole('dialog', { name: 'Handout presentation', exact: true });
    await presentation.waitFor();
    await page.waitForFunction(() => document.querySelector('.handout-presentation-frame')?.getBoundingClientRect().width > 1000);
    await application.evaluate(async ({ BrowserWindow, Menu }) => {
      for (let n = 0; n < 100; n++) {
        if (BrowserWindow.getAllWindows()[0].isFullScreen() && Menu.getApplicationMenu() === null) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw Error('Handout presentation did not enter native fullscreen');
    });
    assert.equal(await page.locator('.editor-panel').isVisible(), false);
    assert.equal(await page.getByLabel('Handout settings', { exact: true }).isVisible(), false);
    assert.equal(await presentation.locator('.handout-presentation-frame').count(), 3);
    const zoom = () => presentation.getByLabel('Presentation zoom').innerText();
    const fitted = parseInt(await zoom());
    await presentation.getByRole('button', { name: 'Zoom in', exact: true }).click();
    assert.ok(parseInt(await zoom()) > fitted);
    await presentation.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await presentation.getByRole('button', { name: 'Fit width', exact: true }).click();
    assert.ok(Math.abs(parseInt(await zoom()) - fitted) <= 1);
    await presentation.locator('img').click();
    assert.equal(await page.getByLabel('Handout settings', { exact: true }).isVisible(), false);
    assert.equal(await page.locator('.media-resize-outline').count(), 0);
    assert.equal(await page.locator('#source').evaluate(el => el.selectionStart), before.start);
    await presentation.locator('video').evaluate(async video => { await video.play(); });
    await page.waitForFunction(() => document.querySelector('.handout-presentation video').currentTime > 0);
    await presentation.screenshot({ path: '/tmp/handout-presentation.png' });
    await presentation.locator('.handout-presentation-viewport').focus();
    await page.keyboard.press('PageDown');
    assert.ok(await presentation.locator('.handout-presentation-viewport').evaluate(el => el.scrollTop) > 0);
    await presentation.locator('.handout-presentation-viewport').evaluate(viewport => {
      const second = viewport.querySelectorAll('.handout-presentation-frame')[1];
      viewport.scrollTop += second.getBoundingClientRect().top - viewport.getBoundingClientRect().top + second.getBoundingClientRect().height * .22;
    });
    await page.keyboard.press('Escape');
    await presentation.waitFor({ state: 'detached' });
    await application.evaluate(async ({ BrowserWindow, Menu }) => {
      for (let n = 0; n < 100; n++) {
        if (!BrowserWindow.getAllWindows()[0].isFullScreen() && Menu.getApplicationMenu() !== null) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw Error('Handout presentation did not restore the native window and menu');
    });
    assert.deepEqual(await page.evaluate(() => {
      const workspace = document.querySelector('.workspace'), source = document.querySelector('#source');
      return { classes: workspace.className, style: workspace.getAttribute('style'), start: source.selectionStart, end: source.selectionEnd, top: source.scrollTop };
    }), before);
    assert.equal(await page.locator('#source').inputValue(), draft);
    assert.equal(await fs.readFile(documentPath, 'utf8'), content);
    assert.ok(await page.locator('.preview-panel').evaluate(el => el.scrollTop) > 0, 'Keep the reading position after exit');
    const restoredPlace = await page.locator('.preview-panel').evaluate(panel => {
      const top = panel.getBoundingClientRect().top + panel.querySelector('.preview-heading').offsetHeight;
      const frames = [...panel.querySelector('#preview').children];
      const index = frames.findIndex(frame => frame.getBoundingClientRect().bottom > top);
      const box = frames[index].getBoundingClientRect();
      return { index, fraction: (top - box.top) / box.height };
    });
    assert.equal(restoredPlace.index, 1);
    assert.ok(Math.abs(restoredPlace.fraction - .22) < .03, JSON.stringify(restoredPlace));
    assert.equal(await page.locator('.editor-panel').isVisible(), true);
    assert.equal(await page.locator('.file-panel').isVisible(), false, 'Keep a previously collapsed panel collapsed');

    // Exit button, OS fullscreen exit, and an already fullscreen window.
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await presentation.waitFor();
    await presentation.getByRole('button', { name: 'Exit presentation', exact: false }).click();
    await presentation.waitFor({ state: 'detached' });
    await application.evaluate(async ({ BrowserWindow }) => {
      for (let n = 0; n < 100 && BrowserWindow.getAllWindows()[0].isFullScreen(); n++) await new Promise(resolve => setTimeout(resolve, 25));
    });
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await presentation.waitFor();
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));
    await presentation.waitFor({ state: 'detached' });

    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await presentation.waitFor();
    await presentation.getByRole('button', { name: 'Exit presentation', exact: false }).click();
    await presentation.waitFor({ state: 'detached' });
    await page.waitForFunction(() => !document.querySelector('#present-handout').disabled);
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true, 'Preserve an already fullscreen window');
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(false));

    // Imposed sheets keep their existing print layout and zoom as a whole sheet.
    await page.locator('#source').fill('---\nlayout: half-duplicate-portrait\n---\n# A half sheet\n\nTwo copies.');
    await page.locator('#preview .sheet-preview-frame').waitFor();
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await presentation.waitFor();
    assert.equal(await presentation.locator('.handout-presentation-frame > .print-sheet').count(), 1);
    assert.equal(await presentation.locator('.handout-page').count(), 2);
    await presentation.getByRole('button', { name: 'Exit presentation', exact: false }).click();
    await presentation.waitFor({ state: 'detached' });
    await page.locator('#source').fill('---\ntype: slides\n---\n# A slide');
    await page.locator('.slide-toolbar').waitFor();
    assert.equal(await page.locator('#present-handout').isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('Native handout fullscreen, zoom, media, reading position, workspace restoration, OS exit, and imposed sheets passed');

    // Browser fallback: denied fullscreen still presents, and narrow controls fit.
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const fallback = await browser.newPage({ viewport: { width: 480, height: 800 } });
    await fallback.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(Error('Unavailable')); });
    await fallback.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
    await fallback.getByRole('button', { name: 'Present', exact: true }).click();
    const fallbackDialog = fallback.getByRole('dialog', { name: 'Handout presentation', exact: true });
    await fallbackDialog.waitFor();
    const toolbarBox = await fallback.locator('.handout-presentation-toolbar').boundingBox();
    assert.ok(toolbarBox.width <= 480);
    await fallback.screenshot({ path: '/tmp/handout-presentation-narrow.png' });
    await fallback.getByRole('button', { name: 'Exit presentation', exact: false }).click();
    await fallbackDialog.waitFor({ state: 'detached' });
    console.log('Windowed browser fallback and narrow presentation controls passed');
  } finally {
    if (browser) await browser.close();
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
