'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const source = `---
type: slides
---
# Encryption systems

:::footer color=white background=#175A80 persist=true height=0.8 size=38
**Objective: **Share our encryption systems.

**Close: **"One way I could improve my system is _____."
:::

---
# Share your evidence
`;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    page.setDefaultTimeout(10000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(source => {
      window.pdfExports = [];
      const snapshot = () => ({ path: '/work', name: 'work', assets: [], tree: [{ type: 'file', markdown: true, path: '/work/footer.md', name: 'footer.md' }] });
      window.handoutDesktop = { platform: 'linux', onMenuCommand: callback => window.menu = callback,
        openFolder: async () => snapshot(), refreshFolder: async () => snapshot(), readFile: async () => source,
        saveFile: async () => {}, setDocumentMode: async () => {}, setPresentation: async () => {},
        exportPdf: async () => {
          window.pdfExports.push([...document.querySelectorAll('.slide-print-deck .slide-text')].filter(node => node.textContent.startsWith('Objective:')).map(node => ({
            size: node.style.fontSize, bold: getComputedStyle([...node.children].find(span => span.textContent === 'Objective: ')).fontWeight, text: node.textContent
          })));
          return '/tmp/footer.pdf';
        }
      };
    }, source);
    await page.goto(pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
    await page.evaluate(() => window.menu({ command: 'open-folder' }));
    await page.getByRole('button', { name: 'footer.md', exact: true }).click();
    const objective = page.locator('#preview .slide-text').filter({ hasText: /^Objective:/ });
    await objective.waitFor();
    const verify = async (locator, size) => {
      await page.waitForFunction(size => [...document.querySelectorAll('#preview .slide-text, .slide-presentation .slide-text')].some(node => node.textContent.startsWith('Objective:') && Math.abs(parseFloat(node.style.fontSize) - size * 96 / 72) < .001), size);
      assert(!((await locator.innerText()).includes('**')));
      assert(Math.abs(await locator.evaluate(node => parseFloat(node.style.fontSize)) - size * 96 / 72) < .001);
      assert.equal(await locator.locator('span').filter({ hasText: /^Objective: $/ }).evaluate(node => getComputedStyle(node).fontWeight), '700');
    };
    await verify(objective, 38);
    await objective.click();
    const size = page.getByLabel('Footer text size (pt)', { exact: true });
    assert.equal(await size.inputValue(), '38');
    await size.fill('28'); await size.press('Tab');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('size=28'));
    await verify(objective, 28);
    await size.fill('38'); await size.press('Tab');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('size=38'));
    await verify(objective, 38);
    assert((await page.locator('#source').inputValue()).includes('**Objective: **Share'));
    await page.getByRole('button', { name: 'Next slide', exact: true }).click();
    await verify(objective, 38);
    await objective.click();
    await size.fill('32'); await size.press('Tab');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('size=32'));
    await verify(objective, 32);
    await size.fill('38'); await size.press('Tab');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('size=38'));
    await verify(objective, 38);
    await page.getByRole('button', { name: 'Present', exact: true }).click();
    const presentation = page.locator('.slide-presentation'); await presentation.waitFor();
    await verify(presentation.locator('.slide-text').filter({ hasText: /^Objective:/ }), 38);
    await page.keyboard.press('Escape'); await presentation.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Export PDF…', exact: true }).click();
    await page.waitForFunction(() => window.pdfExports.length === 1);
    const exported = await page.evaluate(() => window.pdfExports[0]);
    assert.equal(exported.length, 2);
    assert(exported.every(item => Math.abs(parseFloat(item.size) - 38 * 96 / 72) < .001 && item.bold === '700' && !item.text.includes('**')));
    assert.equal(await page.locator('#preview .slide-warning').count(), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: '/tmp/slide-footer-formatting-size.png' });
    console.log('Exact reported footer: bold, size controls, inherited edits, presentation, and PDF render passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
