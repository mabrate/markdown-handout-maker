'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict'), fs = require('fs/promises'), path = require('path'), os = require('os'), { pathToFileURL } = require('url');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-drop-')), imagePath = path.join(root, 'pond.svg');
  await fs.writeFile(imagePath, '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="teal"/></svg>');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } }); page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ root, imagePath, imageUrl }) => {
      window.imports = 0;
      const snapshot = () => ({ path: root, name: 'lessons', assets: [{ relative: 'pond.svg', url: imageUrl }], tree: [{ path: root + '/lesson.md', name: 'lesson.md', type: 'file', markdown: true }] });
      window.handoutDesktop = { onMenuCommand: callback => window.menu = callback, setDocumentMode: async () => {}, openFolder: async () => snapshot(), refreshFolder: async () => snapshot(),
        readFile: async () => '---\ntype: slides\n---\n# Drop image\n\nBefore here.\n\nAfter here.\n', saveFile: async () => {},
        droppedFilePath: () => imagePath, imageReference: async () => 'pond.svg', importImage: async () => { window.imports++; throw Error('Existing images must not be copied'); } };
    }, { root, imagePath, imageUrl: pathToFileURL(imagePath).href });
    await page.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
    await page.evaluate(() => window.menu({ command: 'open-folder' }));
    await page.locator('#file-tree').getByRole('button', { name: 'lesson.md', exact: true }).click();
    async function dropAt(offset, expectedMarkup) {
      const before = await page.locator('#source').inputValue();
      const point = await page.locator('#source').evaluate((source, offset) => {
        const style = getComputedStyle(source), rect = source.getBoundingClientRect(), mirror = document.createElement('div');
        Object.assign(mirror.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: source.clientWidth + 'px', height: source.clientHeight + 'px',
          font: style.font, padding: style.padding, boxSizing: 'border-box', whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap, tabSize: style.tabSize,
          overflow: 'auto', scrollbarWidth: 'none', visibility: 'hidden' });
        const mark = document.createElement('span'); mark.textContent = '\u200b'; mirror.append(document.createTextNode(source.value.slice(0, offset)), mark, document.createTextNode(source.value.slice(offset)));
        document.body.append(mirror); mirror.scrollTop = source.scrollTop; mirror.scrollLeft = source.scrollLeft;
        const box = mark.getBoundingClientRect(), point = { x: box.left + .1, y: box.top + box.height / 2, top: box.top };
        mirror.remove(); return point;
      }, offset);
      await page.locator('#source').evaluate((source, point) => {
        window.dropTransfer = new DataTransfer(); window.dropTransfer.items.add(new File(['<svg/>'], 'pond.svg', { type: 'image/svg+xml' }));
        source.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.dropTransfer, clientX: point.x, clientY: point.y }));
      }, point);
      await page.locator('.editor-drop-caret').waitFor({ state: 'visible' });
      const caret = await page.locator('.editor-drop-caret').boundingBox();
      assert(Math.abs(caret.x - point.x) < 2, JSON.stringify({ caret, point })); assert(Math.abs(caret.y - point.top) < 5);
      assert.equal(await page.locator('#source').inputValue(), before, 'Drag preview does not change the source');
      await page.locator('#source').evaluate((source, point) => source.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.dropTransfer, clientX: point.x, clientY: point.y })), point);
      await page.waitForFunction(() => document.querySelector('#source').value.includes('![pond]'));
      assert.equal(await page.locator('#source').inputValue(), before.slice(0, offset) + expectedMarkup + before.slice(offset));
      assert.equal(await page.locator('.editor-drop-caret').isVisible(), false);
    }
    const slide = await page.locator('#source').inputValue(); await dropAt(slide.indexOf('\n\nAfter') + 1, '![pond](pond.svg){width=3in}');
    await page.waitForFunction(() => document.querySelector('#preview img')?.naturalWidth > 0);
    const imageBox = await page.locator('#preview img').evaluate(node => ({ width: parseFloat(node.style.width), height: parseFloat(node.style.height) }));
    assert(imageBox.width > 96 && imageBox.height > 48, 'Dropped slide images stay visible');
    const wrapped = '# Wrapped source\n\n' + 'A long wrapping line for the image drop caret. '.repeat(80) + '\n\nAfter.';
    await page.locator('#source').fill(wrapped); await page.evaluate(() => window.menu({ command: 'wrap-lines', payload: true }));
    await page.locator('#source').evaluate(source => { source.scrollTop = 250; source.setSelectionRange(2, 2); });
    await dropAt(550, '![pond](pond.svg)');
    assert.equal(await page.evaluate(() => window.imports), 0);
    assert.deepEqual(errors, []);
    console.log('Image drag caret matches actual insertion in wrapped/scrolled text, existing files are referenced, and slide images start at a visible 3in width');
  } finally { await browser.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
