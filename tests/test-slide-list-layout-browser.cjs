'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const initial = '---\ntype: slides\n---\n# Investigate\n\n';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(initial => {
      window.actions = [];
      const snapshot = () => ({ path: '/work', name: 'work', assets: [], tree: [{ type: 'file', markdown: true, path: '/work/list.md', name: 'list.md' }] });
      window.handoutDesktop = { platform: 'linux', onMenuCommand: callback => window.menu = callback,
        openFolder: async () => snapshot(), refreshFolder: async () => snapshot(), readFile: async () => initial,
        saveFile: async () => {}, setDocumentMode: async () => {}, setPresentation: async () => {},
        exportPdf: async () => {
          window.actions.push({ kind: 'pdf', markers: document.querySelectorAll('.slide-print-deck .slide-list-marker').length,
            warnings: document.querySelectorAll('.slide-print-deck .slide-warning').length,
            alignments: [...document.querySelectorAll('.slide-print-deck .slide-list-marker')].map(node => node.style.textAlign),
            colors: [...document.querySelectorAll('.slide-print-deck .slide-list-marker')].map(node => node.style.color) });
          return '/tmp/list-layout.pdf';
        }
      };
    }, initial);
    await page.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
    await page.evaluate(() => window.menu({ command: 'open-folder' }));
    await page.getByRole('button', { name: 'list.md', exact: true }).click();
    await page.locator('#preview .slide-canvas').waitFor();
    await page.evaluate(() => window.menu({ command: 'slide-snippet', payload: 'list' }));
    const numbers = page.locator('#preview .slide-list-marker');
    await page.waitForFunction(() => document.querySelectorAll('#preview .slide-list-marker').length === 6);
    assert.match(await page.locator('#source').inputValue(), /:::list columns=3/);
    assert.match(await page.locator('#preview .slide-canvas').evaluate(node => node.style.fontFamily), /Trebuchet MS/);
    assert.equal(await page.locator('#preview .slide-warning').count(), 0);
    await numbers.nth(3).click();
    assert.match(await page.locator('#source').evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd)), /4\. \*\*Test\*\*/);
    await page.getByLabel('Number color', { exact: true }).fill('#2563eb');
    await page.getByLabel('Number color', { exact: true }).press('Tab');
    await page.waitForFunction(() => document.querySelector('#preview .slide-list-marker').style.color === 'rgb(37, 99, 235)');
    await page.getByLabel('Number size (pt)', { exact: true }).fill('56');
    await page.getByLabel('Number size (pt)', { exact: true }).press('Tab');
    await page.waitForFunction(() => document.querySelector('#preview .slide-list-marker').style.fontSize === '74.6667px');
    await page.getByLabel('List gap', { exact: true }).selectOption('large');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('gap=large') && document.querySelector('[aria-label="List gap"]').value === 'large');
    await page.screenshot({ path: '/tmp/slide-list-layout-grid.png' });
    const before = await page.locator('#source').inputValue();
    await page.getByLabel('List columns', { exact: true }).selectOption('1');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('columns=1'));
    await page.locator('#source').focus(); await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#source').inputValue(), before, 'Property edits undo as one source change');

    for (const [columns, count] of [[2, 4], [3, 6], [4, 8], [1, 3]]) {
      await page.locator('#source').fill(initial + `:::list columns=${columns} number-color=orange\n` + Array.from({ length: count }, (_, n) => `${n + 1}. **Item ${n + 1}** — A short explanation.`).join('\n') + '\n:::\n');
      await page.waitForFunction(count => document.querySelectorAll('#preview .slide-list-marker').length === count, count);
      assert.equal(await page.locator('#preview .slide-warning').count(), 0, columns + ' columns fit in the browser');
      const rectangles = await numbers.evaluateAll(nodes => nodes.map(node => ({ x: node.offsetLeft, y: node.offsetTop })));
      if (columns === 1) assert(rectangles.every(rect => rect.x === rectangles[0].x));
      else { assert.equal(rectangles[0].y, rectangles[1].y); assert(rectangles[1].x > rectangles[0].x); }
      const alignment = await numbers.first().evaluate(node => ({ numberX: node.offsetLeft, numberY: node.offsetTop,
        numberBottom: node.offsetTop + node.offsetHeight, textX: node.nextElementSibling.offsetLeft,
        textY: node.nextElementSibling.offsetTop, leading: node.style.lineHeight }));
      assert.equal(alignment.leading, '1');
      if (columns === 1) { assert.equal(alignment.numberY, alignment.textY); assert(alignment.numberX < alignment.textX); }
      else { assert.equal(alignment.numberX, alignment.textX); assert(alignment.numberBottom < alignment.textY); }
    }
    await page.screenshot({ path: '/tmp/slide-list-layout-vertical.png' });
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const presentation = page.getByRole('dialog', { name: 'Slideshow presentation' });
    await presentation.waitFor(); assert.equal(await presentation.locator('.slide-list-marker').count(), 3);
    assert.equal(await presentation.locator('input,select,nav,footer').count(), 0);
    await page.keyboard.press('Escape'); await presentation.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Export PDF…', exact: true }).click();
    await page.waitForFunction(() => window.actions.some(action => action.kind === 'pdf'));
    assert.deepEqual(await page.evaluate(() => window.actions.find(action => action.kind === 'pdf')), { kind: 'pdf', markers: 3, warnings: 0, alignments: Array(3).fill('left'), colors: Array(3).fill('rgb(255, 165, 0)') });

    await page.locator('#source').fill(initial + ':::list columns=2\n7. **First** paragraph.\n\n   A continuation paragraph.\n\n   - Nested detail\n\n8. Second item.\n:::\n');
    await page.waitForFunction(() => document.querySelectorAll('#preview .slide-list-marker').length === 2);
    await page.locator('#preview .slide-text').filter({ hasText: 'A continuation paragraph.' }).click();
    assert.equal((await page.locator('#source').evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd))).trim(), 'A continuation paragraph.');
    await page.locator('#source').focus();
    await page.locator('#source').evaluate(node => { node.setSelectionRange(node.value.indexOf(':::list'), node.value.indexOf(':::list')); node.dispatchEvent(new Event('select')); });
    assert.equal(await page.getByLabel('List columns', { exact: true }).inputValue(), '2');
    await page.getByLabel('Column widths', { exact: true }).fill('2in,4in');
    await page.getByLabel('Column widths', { exact: true }).press('Tab');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('widths=2in,4in'));
    await page.getByLabel('List alignment', { exact: true }).selectOption('center');
    await page.waitForFunction(() => document.querySelector('#preview .slide-list-marker').style.textAlign === 'center');
    await page.waitForFunction(() => document.querySelectorAll('#preview .slide-list-marker')[1].style.textAlign === 'center');
    const boxWidths = await numbers.evaluateAll(nodes => nodes.map(node => parseFloat(node.style.width)));
    assert(Math.abs(boxWidths[1] - boxWidths[0] * 2) < .01);
    const validSource = await page.locator('#source').inputValue();
    await page.getByLabel('Column widths', { exact: true }).fill('2in,-4in');
    await page.getByLabel('Column widths', { exact: true }).press('Tab');
    assert.equal(await page.getByLabel('Column widths', { exact: true }).evaluate(node => node.checkValidity()), false);
    assert.equal(await page.locator('#source').inputValue(), validSource);
    await page.getByLabel('Column widths', { exact: true }).fill('2in,4in');
    await page.getByLabel('Column widths', { exact: true }).press('Tab');
    await page.getByLabel('List type', { exact: true }).selectOption('unordered');
    await page.waitForFunction(() => document.querySelectorAll('#preview .slide-list-marker').length === 0 && document.querySelector('[aria-label="List type"]')?.value === 'unordered');
    assert.equal(await numbers.count(), 0);
    const unorderedSource = await page.locator('#source').inputValue();
    assert.match(unorderedSource, /- \*\*First\*\* paragraph\./);
    assert.match(unorderedSource, /\n  A continuation paragraph\./);
    assert.match(await page.locator('#preview .slide-canvas').innerText(), /Nested detail/);
    assert.equal(await page.getByLabel('List type', { exact: true }).inputValue(), 'unordered');
    await page.getByLabel('List type', { exact: true }).selectOption('ordered');
    await page.waitForFunction(() => document.querySelector('#preview .slide-list-marker')?.textContent === '1');
    assert.match(await page.locator('#source').inputValue(), /\n1\. \*\*First\*\* paragraph\./);
    await page.locator('#source').focus(); await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#source').inputValue(), unorderedSource, 'List conversion is one undoable edit');
    await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#source').inputValue(), validSource, 'Undo restores the original numbers and indentation');
    await page.locator('#source').fill(initial + ':::list columns=3 widths=2in,4in,2in align=center number-color=#2563eb\n1. **Observe** — Look closely.\n2. **Compare** — Describe the evidence in the wider middle column.\n3. **Explain** — Share your idea.\n:::\n');
    await page.waitForFunction(() => document.querySelectorAll('#preview .slide-list-marker').length === 3);
    assert.equal(await page.locator('#preview .slide-warning').count(), 0);
    assert.deepEqual(await numbers.evaluateAll(nodes => nodes.map(node => node.style.textAlign)), Array(3).fill('center'));
    await numbers.nth(1).click();
    await page.screenshot({ path: '/tmp/slide-list-widths-alignment.png' });
    await page.getByLabel('List columns', { exact: true }).selectOption('2');
    await page.waitForFunction(() => document.querySelector('[aria-label="Column widths"]')?.value === '2in,4in' && document.querySelector('[aria-label="List columns"]')?.value === '2');
    assert.equal(await page.getByLabel('Column widths', { exact: true }).inputValue(), '2in,4in');
    assert.equal(await page.getByLabel('List alignment', { exact: true }).inputValue(), 'center');
    await page.locator('#source').focus(); await page.keyboard.press('Control+z');
    await page.waitForFunction(() => document.querySelector('[aria-label="List columns"]')?.value === '3');
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await presentation.waitFor();
    assert.deepEqual(await presentation.locator('.slide-list-marker').evaluateAll(nodes => nodes.map(node => node.style.textAlign)), Array(3).fill('center'));
    await page.keyboard.press('Escape'); await presentation.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Export PDF…', exact: true }).click();
    await page.waitForFunction(() => window.actions.filter(action => action.kind === 'pdf').length === 2);
    assert.deepEqual(await page.evaluate(() => window.actions.filter(action => action.kind === 'pdf').at(-1).alignments), Array(3).fill('center'));
    const headlineSource = initial + ':::list columns=3 widths=2in align=center\n1. Observe the example.\n2. Record evidence.\n3. Explain your idea.\n:::\n';
    await page.locator('#source').fill(headlineSource);
    await page.waitForFunction(() => document.querySelectorAll('#preview .slide-list-marker').length === 3 && document.querySelector('#preview .slide-list-marker').style.width === '192px');
    const centeredBounds = await numbers.evaluateAll(nodes => ({ left: parseFloat(nodes[0].style.left), right: parseFloat(nodes[2].style.left) + parseFloat(nodes[2].style.width), canvas: parseFloat(nodes[0].parentElement.style.width) }));
    assert(Math.abs((centeredBounds.left + centeredBounds.right) / 2 - centeredBounds.canvas / 2) < .01);
    const gridTop = await numbers.first().evaluate(node => node.style.top);
    const headline = page.locator('#preview .slide-text').filter({ hasText: /^Investigate$/ });
    const headlineFont = await headline.evaluate(node => node.style.fontSize);
    await headline.click();
    await page.getByLabel('Heading alignment', { exact: true }).selectOption('center');
    await page.waitForFunction(() => [...document.querySelectorAll('#preview .slide-text')].find(node => node.textContent === 'Investigate')?.style.textAlign === 'center');
    assert.match(await page.locator('#source').inputValue(), /:::center\n# Investigate\n:::/);
    assert.equal(await numbers.first().evaluate(node => node.style.top), gridTop, 'Centering a headline preserves the grid position');
    assert.equal(await headline.evaluate(node => node.style.fontSize), headlineFont);
    assert.equal(await page.getByLabel('Heading alignment', { exact: true }).inputValue(), 'center');
    await page.screenshot({ path: '/tmp/slide-centered-headline-grid.png' });
    await page.locator('#source').focus(); await page.keyboard.press('Control+z');
    assert.equal(await page.locator('#source').inputValue(), headlineSource);
    await page.keyboard.press('Control+Shift+z');
    await page.waitForFunction(() => [...document.querySelectorAll('#preview .slide-text')].find(node => node.textContent === 'Investigate')?.style.textAlign === 'center');
    await page.getByRole('button', { name: 'Present', exact: true }).click(); await presentation.waitFor();
    assert.equal(await presentation.locator('.slide-text').filter({ hasText: /^Investigate$/ }).evaluate(node => node.style.textAlign), 'center');
    await page.keyboard.press('Escape'); await presentation.waitFor({ state: 'detached' });
    await headline.click(); await page.getByLabel('Heading alignment', { exact: true }).selectOption('left');
    await page.waitForFunction(() => !document.querySelector('#source').value.includes(':::center'));
    assert.equal(await page.locator('#source').inputValue(), headlineSource);
    await numbers.first().click(); await page.getByLabel('List columns', { exact: true }).selectOption('4');
    await page.waitForFunction(() => document.querySelector('[aria-label="List columns"]')?.value === '4');
    assert.equal(await page.getByLabel('Column widths', { exact: true }).inputValue(), '2in', 'A shared width stays shared when the column count changes');
    assert.deepEqual(errors, []);
    console.log('List grids, shared/absolute widths, centered grid and flowing headings, type conversion, Undo, source selection, presenting, and PDF rendering passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
