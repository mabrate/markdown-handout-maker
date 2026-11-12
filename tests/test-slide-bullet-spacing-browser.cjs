'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const narrow = 'little details in this illustration '.repeat(2).trim();
const initial = `---\ntype: slides\ntheme: light\naspect: 4:3\n---\n# Observations\n\n- ${narrow}\n- Following bullet.\n`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(initial => {
      const snapshot = () => ({ path: '/work', name: 'work', assets: [], tree: [{ type: 'file', markdown: true, path: '/work/spacing.md', name: 'spacing.md' }] });
      window.handoutDesktop = {
        onMenuCommand: callback => window.menu = callback, openFolder: async () => snapshot(), refreshFolder: async () => snapshot(),
        readFile: async () => initial, setDocumentMode: async () => {}, setPresentation: async () => {},
        exportPdf: async () => {
          window.printPositions = [...document.querySelectorAll('.slide-print-deck .slide-text')].map(node => ({ text: node.textContent, y: node.style.top, h: node.style.height }));
          return '/tmp/bullet-spacing.pdf';
        }
      };
    }, initial);
    await page.goto(pathToFileURL(path.resolve(__dirname, '../renderer/index.html')).href);
    await page.evaluate(() => window.menu({ command: 'open-folder' }));
    await page.getByRole('button', { name: 'spacing.md', exact: true }).click();
    await page.locator('#preview .slide-canvas').waitFor();

    // Compare allocated heights against independently auto-sized clones of the
    // displayed text. Cover both sides of wrap thresholds, mixed spans, explicit
    // breaks, long words, nested items, column widths, and theme fonts.
    const results = await page.evaluate(() => {
      const model = window.HandoutSlides, results = [];
      const texts = [
        ...Array.from({ length: 10 }, (_, i) => 'little details in this illustration '.repeat(i + 1).trim()),
        '**Observe** the *little details* and `record your findings`. '.repeat(3).trim(),
        'First line\n  continued deliberately.', 'W'.repeat(100), 'i'.repeat(110),
        'Observe the structure and describe what happens as you slowly add more weight.'
      ];
      for (const theme of ['light', 'classroom', 'dark']) for (const columns of [false, true]) for (const text of texts) {
        const content = `- ${text}\n  - Nested detail.\n- Following bullet.\n`;
        const source = `---\ntype: slides\ntheme: ${theme}\naspect: 4:3\n---\n# Observations\n\n` + (columns ? `:::columns\n:::column\n${content}\n:::column\nOther column.\n:::\n` : content);
        const scene = model.scene(model.parse(source), 0);
        const canvas = document.createElement('div'); canvas.className = 'slide-canvas';
        Object.assign(canvas.style, { position: 'fixed', left: '-100000px', visibility: 'hidden', fontFamily: scene.theme.font + ', Arial, sans-serif' });
        document.body.append(canvas);
        for (const list of scene.lists) for (const [i, item] of list.items.entries()) {
          const element = scene.elements.find(e => e.listId === list.id && e.runs === item.runs);
          const node = document.createElement('div'); node.className = 'slide-text';
          Object.assign(node.style, { width: element.w * 96 + 'px', fontSize: item.fontSize * 96 / 72 + 'px' });
          for (const run of item.runs) {
            const span = document.createElement('span'); span.textContent = run.text;
            if (run.bold) span.style.fontWeight = 'bold';
            if (run.italic) span.style.fontStyle = 'italic';
            if (run.code) span.style.fontFamily = 'Courier New';
            node.append(span);
          }
          canvas.append(node);
          const actual = node.getBoundingClientRect().height / 96;
          results.push({ theme, columns, text: model.plain(item.runs), allocated: item.h, actual,
            distance: list.items[i + 1] ? list.items[i + 1].y - item.y : null });
        }
        canvas.remove();
      }
      return results;
    });
    for (const result of results) {
      assert(Math.abs(result.allocated - Math.max(.25, result.actual + .035)) < .001, JSON.stringify(result));
      if (result.distance !== null) assert(Math.abs(result.distance - result.allocated - .16) < .001, JSON.stringify(result));
    }
    assert(results.some(r => r.actual > .7), 'Actually wrapped items are measured');
    assert(results.some(r => r.text.length > 75 && r.actual < .4), 'Long narrow text fits on one line');

    const positions = selector => page.locator(selector + ' .slide-text').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, y: node.style.top, h: node.style.height })));
    const preview = await positions('#preview');
    const first = preview.find(node => node.text === narrow), next = preview.find(node => node.text === 'Following bullet.');
    assert(parseFloat(first.h) < 41, 'The reported long-but-fitting bullet reserves one line');
    assert(Math.abs(parseFloat(next.y) - parseFloat(first.y) - parseFloat(first.h) - .16 * 96) < .01);
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    await page.locator('.slide-presentation').waitFor();
    assert.deepEqual(await positions('.slide-presentation'), preview);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.menu({ command: 'export-pdf' }));
    await page.waitForFunction(() => window.printPositions);
    assert.deepEqual(await page.evaluate(() => window.printPositions), preview);
    assert.deepEqual(errors, []);
    console.log(`Bullet spacing matches rendered text in ${results.length} cases; preview, presentation, and PDF layout agree`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
