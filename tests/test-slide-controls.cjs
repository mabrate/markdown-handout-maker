'use strict';
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict'), fs = require('fs/promises'), path = require('path'), os = require('os');
const { pathToFileURL } = require('url');
const model = require('../renderer/slides');
const deck = '---\ntype: slides\n---\n# First\n\nContent for students.\n\n:::notes\nPrivate teacher notes.\n:::\n\n---\n# Second\n\nSecond slide content.\n';
const handout = '# A handout\n\nHandout content.\n';
(async () => {
  let application, browser, temp, page;
  try {
    if (process.env.NATIVE_ELECTRON) {
      temp = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-slide-controls-')); const root = path.join(temp, 'lesson'); await fs.mkdir(root);
      await fs.writeFile(path.join(root, 'deck.md'), deck); await fs.writeFile(path.join(root, 'handout.md'), handout);
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      application = await playwright._electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + path.join(temp, 'profile')], env, timeout: 15000 });
      page = await application.firstWindow(); await page.waitForLoadState('load');
      await application.evaluate(({ dialog, BrowserWindow }, root) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] }); BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command: 'open-folder' }); }, root);
      assert.equal(await application.evaluate(({ Menu }) => Menu.getApplicationMenu().items.some(item => item.label === 'Slides')), false);
    } else {
      browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true, args: ['--no-sandbox'] });
      page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
      await page.addInitScript(({ deck, handout }) => {
        const snapshot = () => ({ path: '/work', name: 'work', assets: [], tree: ['deck.md', 'handout.md'].map(name => ({ type: 'file', markdown: true, path: '/work/' + name, name })) });
        window.handoutDesktop = { onMenuCommand: callback => window.menu = callback, openFolder: async () => snapshot(), refreshFolder: async () => snapshot(),
          readFile: async file => file.endsWith('deck.md') ? deck : handout, setDocumentMode: async () => {}, setPresentation: async () => {} };
      }, { deck, handout });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../renderer/index.html')).href); await page.evaluate(() => window.menu({ command: 'open-folder' }));
    }
    page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const source = page.locator('#source'), footer = page.getByRole('button', { name: 'Footer', exact: true }), fit = page.getByRole('button', { name: 'Fit content', exact: true });
    const undo = async original => { await source.focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await page.waitForFunction(original => document.querySelector('#source').value === original, original); };
    const insertFooter = () => application ? application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('insert-footer').click()) : page.evaluate(() => window.menu({ command: 'insert-content', payload: 'footer' }));
    await page.locator('#file-tree').getByRole('button', { name: 'handout.md', exact: true }).click(); await page.locator('.handout-page').waitFor();
    assert.equal(await footer.isVisible(), false); assert.equal(await fit.isVisible(), false);
    if (application) assert.equal(await application.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('insert-footer').enabled), false);
    await page.locator('#file-tree').getByRole('button', { name: 'deck.md', exact: true }).click(); await footer.waitFor();
    assert.equal(await page.getByRole('button',{name:'Add slide',exact:true}).count(),0);await page.getByRole('button',{name:'Insert slide',exact:true}).waitFor();
    assert.equal(await page.locator('.slide-toolbar').getByRole('button',{name:/Export/}).count(),0);
    const present=page.getByRole('button',{name:'Present',exact:true});assert.equal(await present.innerText(),'');assert.equal(await present.locator('svg').count(),1);
    assert.equal(await present.locator('..').getAttribute('class'),'slide-presentation-actions');
    assert.equal(await page.getByRole('button', { name: 'Footer properties', exact: true }).count(), 0);
    assert.equal(await fit.isEnabled(), true);
    await fit.click(); await page.waitForFunction(() => document.querySelector('#source').value.includes(':::fit'));
    const fitted = model.parse(await source.inputValue()); assert.equal(fitted.slides[0].fit, true); assert.equal(fitted.slides[1].fit, false);
    assert.equal(fitted.slides[0].notes, 'Private teacher notes.'); assert.equal(await fit.isDisabled(), true); await undo(deck);
    await footer.click();
    const size = page.getByLabel('Footer text size (pt)', { exact: true }); await size.waitFor();
    await page.waitForFunction(() => document.querySelector('#source').value.includes(':::footer'));
    const created = await source.inputValue(), parsed = model.parse(created);
    assert.equal(parsed.slides[0].footer.blocks[0].runs[0].text, 'Footer text'); assert.equal(parsed.slides[1].footer, null);
    assert.equal(parsed.slides[0].notes, 'Private teacher notes.'); assert.deepEqual(parsed.slides.flatMap(slide => slide.warnings), []);
    assert.equal(await source.evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd)), 'Footer text');
    await page.locator('#preview .slide-text').filter({ hasText: /^Footer text$/ }).waitFor();
    await footer.click(); assert.equal(await source.inputValue(), created, 'Footer opens existing settings without inserting again');
    await undo(deck); await page.waitForFunction(() => !document.querySelector('#source').value.includes(':::footer'));
    await page.locator('.slide-outline button[data-slide-index="0"]').click();
    await insertFooter(); await size.waitFor(); assert.equal(await source.inputValue(), created, 'Snippet and toolbar create the same footer');
    await page.getByLabel('Continue on following slides', { exact: true }).selectOption('true');
    await page.waitForFunction(() => document.querySelector('#source').value.includes('persist=true'));
    await page.getByRole('button', { name: 'Next slide', exact: true }).click();
    const inherited = await source.inputValue(); await footer.click(); assert.equal(await source.inputValue(), inherited);
    assert.equal(await page.locator('#preview .slide-card').getAttribute('data-slide-index'), '1', 'Opening inherited settings stays on the selected slide');
    assert.equal((inherited.match(/^:::footer/gm) || []).length, 1);
    await size.fill('24'); await size.press('Tab'); await page.waitForFunction(() => document.querySelector('#source').value.includes('size=24'));
    assert.equal(model.parse(await source.inputValue()).slides[1].footer.size, 24);
    await page.screenshot({ path: '/tmp/handout-slide-footer-controls.png' });

    // Fitting a slide that already has a footer keeps its footer and private notes.
    await page.locator('.slide-outline button[data-slide-index="0"]').click(); const beforeFit = await source.inputValue();
    await fit.click(); await page.waitForFunction(() => document.querySelector('#source').value.includes(':::fit'));
    const withFooter = model.parse(await source.inputValue()); assert.equal(withFooter.slides[0].footer.size, 24); assert.equal(withFooter.slides[0].notes, 'Private teacher notes.');
    await undo(beforeFit);
    await page.keyboard.press('F5'); await page.getByRole('dialog', { name: 'Slideshow presentation', exact: true }).waitFor();
    await page.keyboard.press('Escape'); await page.locator('.slide-presentation').waitFor({ state: 'detached' });
    const hidden = '---\ntype: slides\n---\n# Hidden\n\n:::footer hidden=true\nHidden text\n:::\n';
    await source.fill(hidden); await page.waitForFunction(() => document.querySelectorAll('.slide-outline button[data-slide-index]').length === 1);
    await footer.click(); assert.equal(await source.inputValue(), hidden); assert.equal(await page.getByLabel('Hide footer', { exact: true }).inputValue(), 'true');
    // Deleting the only slide leaves an editable blank slide and supports Undo.
    await page.locator('.slide-outline button[data-slide-index="0"]').click({button:'right'});
    await page.getByRole('menuitem',{name:'Delete slide',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('#source').value.includes('Hidden text'));
    assert.equal(model.parse(await source.inputValue()).slides.length,1);assert.equal(await source.inputValue(),'---\ntype: slides\n---\n');
    await page.locator('.slide-outline button[data-slide-index="0"]').click({button:'right'});
    assert.equal(await page.getByRole('menuitem',{name:'Delete slide',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');await undo(hidden);
    await source.fill(deck);await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button[data-slide-index]').length===2);
    await page.locator('.slide-outline button[data-slide-index="0"]').click();
    await page.locator('.slide-outline button[data-slide-index="1"]').click({button:'right'});
    await page.screenshot({path:'/tmp/handout-slide-context-actions.png'});
    await page.keyboard.press('Escape');assert.equal(await source.inputValue(),deck,'Closing the context menu does not edit the deck');
    await page.locator('.slide-outline button[data-slide-index="1"]').click({button:'right'});await page.getByRole('menuitem',{name:'Delete slide',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button[data-slide-index]').length===1);
    const deletedSecond=await source.inputValue();assert.equal(model.parse(deletedSecond).slides[0].notes,'Private teacher notes.');assert(!deletedSecond.includes('Second slide content.'));await undo(deck);
    await source.press(process.platform==='darwin'?'Meta+Shift+z':'Control+Shift+z');await page.waitForFunction(original=>document.querySelector('#source').value===original,deletedSecond);await undo(deck);
    await page.locator('.slide-outline button[data-slide-index="0"]').click();
    await page.locator('#preview .slide-text').filter({hasText:/Content for students/}).click({button:'right'});await page.getByRole('menuitem',{name:'Delete slide',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button[data-slide-index]').length===1);
    assert.equal(model.plain(model.parse(await source.inputValue()).slides[0].title),'Second');assert(!(await source.inputValue()).includes('Private teacher notes.'));await undo(deck);
    if(temp)assert.equal(await fs.readFile(path.join(temp,'lesson','deck.md'),'utf8'),deck,'Deleting slides does not write the file until Save');
    await page.locator('.document-tab-label').filter({ hasText: 'handout.md' }).click(); await page.locator('.handout-page').waitFor();
    assert.equal(await footer.isVisible(), false); assert.equal(await fit.isVisible(), false);
    assert.deepEqual(errors, []);
    console.log('Slide toolbar, presentation icon, Fit, Footer, right-click deletion, notes, Undo/Redo, F5, and handout visibility passed' + (application ? ' in native Electron' : ''));
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    if (browser) await browser.close();
    if (temp) await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
