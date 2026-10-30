'use strict';
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict'), fs = require('fs/promises'), path = require('path'), os = require('os'), { pathToFileURL } = require('url');
const picture = 'image-2026-10-29-123313.svg';
const fixture = '---\ntype: slides\ntheme: classroom\naspect: 16:9\n---\n\n# First\n\nA short introduction.\n\n---\n\n:::text x=5.4% y=20.4% width=33.2% size=34 color=#175A80\n# New lesson\n:::\n\n:::list columns=2 align=right widths=4 number-size=32 gap=small\n' + Array.from({ length: 4 }, (_, n) => `${n + 1}. ![image 2026 10 29 123313](${picture})`).join('\n') + '\n\n:::\n\n---\n# Reflect\n\nWhat changed your thinking today?\n';
(async () => {
  let browser, application, temp;
  const original = process.env.EDITOR_FIXTURE_PATH ? await fs.readFile(process.env.EDITOR_FIXTURE_PATH, 'utf8') : fixture;
  const source = original, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="teal"/></svg>';
  const imageNames = [...new Set([...source.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(match => match[1]).filter(value => !/^(?:[a-z]+:|\/|\\|\.\.)/i.test(value)))];
  try {
    let page;
    if (process.env.NATIVE_ELECTRON) {
      temp = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-editor-overlays-')); const lesson = path.join(temp, 'lessons'); await fs.mkdir(lesson);
      await fs.writeFile(path.join(lesson, 'slideshow-template.md'), source);
      for (const name of imageNames) {
        await fs.mkdir(path.dirname(path.join(lesson, name)), { recursive: true });
        if (process.env.EDITOR_FIXTURE_PATH) await fs.copyFile(path.resolve(path.dirname(process.env.EDITOR_FIXTURE_PATH), name), path.join(lesson, name));
        else await fs.writeFile(path.join(lesson, name), svg);
      }
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      application = await playwright._electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + path.join(temp, 'profile')], env, timeout: 15000 });
      page = await application.firstWindow(); await page.waitForLoadState('load');
      await application.evaluate(({ dialog, BrowserWindow }, lesson) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [lesson] }); BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open-folder' }); }, lesson);
    } else {
      browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
      page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
      await page.addInitScript(({ source, imageNames, imageUrl }) => {
        window.handoutDesktop = { onMenuCommand: callback => window.menu = callback, setDocumentMode: async () => {}, readFile: async () => source,
          openFolder: async () => ({ path: '/work', name: 'work', assets: imageNames.map(relative => ({ relative, url: imageUrl })), tree: [{ path: '/work/slideshow-template.md', name: 'slideshow-template.md', type: 'file', markdown: true }] }) };
      }, { source, imageNames, imageUrl: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') });
      await page.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href); await page.evaluate(() => window.menu({ command: 'open-folder' }));
    }
    page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const command = async (command, payload) => {
      if (application) await application.evaluate(({ BrowserWindow }, message) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', message), { command, payload });
      else await page.evaluate(message => window.menu(message), { command, payload });
    };
    await page.locator('#file-tree').getByRole('button', { name: 'slideshow-template.md', exact: true }).click();
    const headingLine = source.split('\n').findIndex((line, n, lines) => /^# New lesson/.test(line) && /^:::text/.test(lines[n - 1]));
    assert(headingLine >= 0);
    const slideIndex = await page.evaluate(headingLine => window.HandoutSlides.parse(document.querySelector('#source').value).slides.findIndex(slide => headingLine >= slide.startLine && headingLine < slide.endLine), headingLine);
    await page.locator('.slide-outline button').nth(slideIndex).click();
    const heading = page.locator('#preview .slide-positioned-text').filter({ hasText: 'New lesson' });
    await heading.waitFor();
    async function checkLayers(label) {
      const layers = await page.evaluate(() => {
        const source = document.querySelector('#source'), highlight = document.querySelector('.source-highlight'), native = getComputedStyle(source), syntax = getComputedStyle(highlight);
        const selection = document.querySelector('.source-selection-highlight mark'); let selectionDrift = 0;
        if (selection) {
          const box = source.getBoundingClientRect(), mirror = document.createElement('div');
          Object.assign(mirror.style, { position: 'fixed', left: box.left + 'px', top: box.top + 'px', width: box.width - (source.offsetWidth - source.clientWidth) + 'px', height: box.height - (source.offsetHeight - source.clientHeight) + 'px',
            font: native.font, padding: native.padding, whiteSpace: native.whiteSpace, overflowWrap: native.overflowWrap,
            letterSpacing: native.letterSpacing, tabSize: native.tabSize, overflow: 'auto', scrollbarWidth: 'none', visibility: 'hidden' });
          const selected = document.createElement('span'); selected.textContent = source.value.slice(source.selectionStart, source.selectionEnd);
          mirror.append(document.createTextNode(source.value.slice(0, source.selectionStart)), selected, document.createTextNode(source.value.slice(source.selectionEnd) + '\n'));
          document.body.append(mirror); mirror.scrollTop = source.scrollTop; mirror.scrollLeft = source.scrollLeft;
          selectionDrift = Math.abs(selected.getBoundingClientRect().top - selection.getBoundingClientRect().top); mirror.remove();
        }
        return { native: native.color, syntaxVisibility: syntax.visibility, sourceWidth: source.clientWidth, overlayWidth: highlight.clientWidth,
          sourceScroll: source.scrollTop, overlayScroll: highlight.scrollTop, sourceFont: native.font, overlayFont: syntax.font,
          selection: source.value.slice(source.selectionStart, source.selectionEnd), selectionDrift };
      });
      if (layers.native !== 'rgba(0, 0, 0, 0)' && layers.native !== 'transparent') assert.equal(layers.syntaxVisibility, 'hidden', label + ': native and syntax glyphs must not both paint');
      assert(Math.abs(layers.sourceWidth - layers.overlayWidth) <= 1, label + ': overlay must use the textarea viewport width ' + JSON.stringify(layers));
      assert.equal(layers.sourceFont, layers.overlayFont, label + ': fonts must match');
      assert(Math.abs(layers.sourceScroll - layers.overlayScroll) <= 1, label + ': scrolling must match');
      assert(layers.selectionDrift < 1, label + ': selected text must align with the textarea ' + JSON.stringify(layers));
      return layers;
    }
    for (const wrap of [false, true]) {
      await command('wrap-lines', wrap);
      await heading.click(); await page.waitForTimeout(100);
      await checkLayers('Positioned heading, wrap=' + wrap);
      await command('find'); await page.getByRole('searchbox', { name: 'Find in document', exact: true }).fill('lesson');
      await heading.click(); await page.waitForTimeout(100);
      await page.screenshot({ path: '/tmp/editor-overlay-' + (wrap ? 'wrapped' : 'unwrapped') + '.png' });
      await checkLayers('Positioned heading with Find, wrap=' + wrap);
      await page.locator('#source').click(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
      await checkLayers('Editor focused after heading selection');
      await page.locator('.find-close').click();
    }
    assert.equal(await page.locator('#source').inputValue(), source, 'Clicking the heading never changes Markdown');
    assert.deepEqual(errors, []);
    console.log('Positioned-heading editor layers, Find, line wrap, viewport sizing, focus and source integrity passed' + (application ? ' in native Electron' : ''));
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    if (browser) await browser.close(); if (temp) await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
