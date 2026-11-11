'use strict';
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises'), path = require('path'), os = require('os'), assert = require('assert/strict');
const slides = require('../renderer/slides');
(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-insert-native-'));
  const root = path.join(temp, 'lesson'), profile = path.join(temp, 'profile');
  const handout = '# Handout\n\nRead more.\n', deck = '---\ntype: slides\n---\n# First slide\n\nRead more.\n\n---\n# Second slide\n';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="100" height="80" fill="red"/></svg>';
  await fs.mkdir(root); await fs.writeFile(path.join(root, 'handout.md'), handout); await fs.writeFile(path.join(root, 'deck.md'), deck);
  await fs.writeFile(path.join(root, 'art sketch.svg'), svg); await fs.writeFile(path.join(temp, 'outside.svg'), svg);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  let application;
  try {
    application = await _electron.launch({ executablePath: require('electron'), args: [path.resolve(__dirname, '..'), '--no-sandbox', '--user-data-dir=' + profile], env, timeout: 15000 });
    const page = await application.firstWindow(); page.setDefaultTimeout(10000); await page.waitForLoadState('load');
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const source = page.locator('#source');
    const click = id => application.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById('insert-' + id).click(), id);
    const command = command => application.evaluate(({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0].webContents.send('menu:command', { command }), command);
    const save = async () => { await command('save'); await page.waitForFunction(() => !document.querySelector('.document-tab.active').innerText.includes('*')); };
    const state = id => application.evaluate(({ Menu }, id) => { const item = Menu.getApplicationMenu().getMenuItemById('insert-' + id); return { enabled: item.enabled, label: item.label }; }, id);
    const waitEnabled = (id, enabled) => application.evaluate(({ Menu }, { id, enabled }) => new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        if (Menu.getApplicationMenu().getMenuItemById('insert-' + id).enabled === enabled) { clearInterval(timer); resolve(); }
        else if (++attempts > 100) { clearInterval(timer); reject(Error('Menu state did not update: ' + id)); }
      }, 25);
    }), { id, enabled });
    const undo = async original => { await source.focus(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await page.waitForFunction(original => document.querySelector('#source').value === original, original); };
    const end = () => source.evaluate(node => { node.focus(); node.setSelectionRange(node.value.length, node.value.length); });
    const choose = target => application.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => target ? { canceled: false, filePaths: [target] } : { canceled: true, filePaths: [] }; }, target);
    await waitEnabled('heading', true); assert.equal((await state('image')).enabled, false); assert.equal((await state('drawing')).enabled, false);
    assert.equal(await page.getByRole('button', { name: 'Draw image…', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Insert internal link', exact: true }).count(), 0);
    await choose(root); await command('open-folder');
    await page.locator('#file-tree').getByRole('button', { name: 'handout.md', exact: true }).click(); await page.waitForFunction(original => document.querySelector('#source').value === original, handout);
    await waitEnabled('image', true); assert.equal((await state('question')).enabled, true); assert.equal((await state('background')).enabled, false);
    await click('background'); assert.equal(await source.inputValue(), handout, 'Renderer rejects unsupported commands');

    const shared = {};
    for (const [name, original, slideMode] of [['handout.md', handout, false], ['deck.md', deck, true]]) {
      await page.locator('#file-tree').getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(original => document.querySelector('#source').value === original, original);
      await waitEnabled('background', slideMode); assert.equal((await state('question')).enabled, !slideMode);
      assert.equal((await state('internal-link')).label, slideMode ? 'Link to Slide…' : 'Link to Heading…');
      if (slideMode) { await click('question'); assert.equal(await source.inputValue(), original); }
      for (const id of ['heading', 'checklist', 'qr', 'youtube', 'video', 'cards']) {
        if (slideMode) await page.locator('.slide-outline button[data-slide-index="0"]').click(); else await end();
        await click(id); await page.waitForFunction(original => document.querySelector('#source').value !== original, original);
        const content = await source.inputValue();
        if (slideMode) {
          const parsed = slides.parse(content); assert.equal(parsed.slides.length, 2); assert.deepEqual(parsed.warnings, []);
          assert.deepEqual(parsed.slides.flatMap(slide => slide.warnings), []);
          assert(content.includes(shared[id]), id + ' shares its syntax with handouts');
          assert(content.indexOf(shared[id]) < content.indexOf('# Second slide'), id + ' targets the selected slide');
        } else shared[id] = content.slice(original.length).trim();
        await undo(original);
      }
      for (const [id, title, button] of [['table', 'Insert a table', 'Insert table'], ['columns', 'Insert columns', 'Insert columns'], ['rubric', 'Insert a rubric', 'Insert rubric']]) {
        if (slideMode) await page.locator('.slide-outline button[data-slide-index="0"]').click(); else await end();
        await click(id); const dialog = page.getByRole('dialog', { name: title, exact: true }); await dialog.waitFor();
        if (id !== 'rubric') assert.equal(await dialog.locator('select[name="format"]').isVisible(), !slideMode);
        await dialog.getByRole('button', { name: button, exact: true }).click();
        await page.waitForFunction(original => document.querySelector('#source').value !== original, original);
        const content = await source.inputValue();
        if (slideMode) { assert(content.includes(shared[id])); assert.deepEqual(slides.parse(content).slides.flatMap(slide => slide.warnings), []); }
        else shared[id] = content.slice(original.length).trim();
        await undo(original);
      }
      // Web links use the same standard Markdown in either format and retain Undo.
      await source.evaluate(node => { node.focus(); const start = node.value.indexOf('Read more.'); node.setSelectionRange(start, start + 10); });
      await click('link'); let link = page.getByRole('dialog', { name: 'Insert link', exact: true });
      assert.equal(await link.getByLabel('Link text', { exact: true }).inputValue(), 'Read more.');
      await page.screenshot({ path: path.join(os.tmpdir(), 'handout-insert-link-' + (slideMode ? 'slides' : 'handout') + '.png') });
      await link.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(await source.inputValue(), original);
      await click('link'); link = page.getByRole('dialog', { name: 'Insert link', exact: true });
      await link.getByLabel('Web address', { exact: true }).fill('javascript:alert(1)'); await link.getByRole('button', { name: 'Insert link', exact: true }).click();
      await link.getByRole('alert').getByText('Use an https:// or http:// web address.').waitFor(); assert.equal(await source.inputValue(), original);
      await link.getByLabel('Web address', { exact: true }).fill('https://example.com/a(b)'); await link.getByRole('button', { name: 'Insert link', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#source').value.includes('[Read more.](https://example.com/a%28b%29)')); await undo(original);

      await end(); await choose(null); await click('image'); assert.equal(await source.inputValue(), original, 'Cancel keeps the document');
      await choose(path.join(root, 'art sketch.svg')); await click('image');
      await page.waitForFunction(() => document.querySelector('#source').value.includes('![art sketch](art%20sketch.svg)'));
      assert.equal(await page.locator('#file-tree .image-entry').filter({ hasText: 'art sketch.svg' }).count(), 1, 'Referencing an existing image does not duplicate the tree entry');
      await assert.rejects(fs.access(path.join(root, 'images')), /ENOENT/); await undo(original);
      await save();
    }
    await end(); await choose(path.join(temp, 'outside.svg')); await click('image');
    await page.waitForFunction(() => /!\[outside\]\(images\/image-.*\.svg\)/.test(document.querySelector('#source').value));
    assert.equal((await fs.readdir(path.join(root, 'images'))).length, 1); await undo(deck);

    // Typing a format change updates the menu without reopening the document.
    await source.fill('# Now a handout\n'); await waitEnabled('question', true); await waitEnabled('background', false); await undo(deck); await waitEnabled('background', true);
    await page.locator('.document-tab-label').filter({ hasText: 'handout.md' }).click(); await waitEnabled('question', true);
    const aliases = '# Columns\n\n:::columns widths=1/3,2/3\n:::column\nLeft\n:::column\n:::grid columns=2\n:::cell\nRight one\n:::cell\nRight two\n:::\n:::\n';
    await source.fill(aliases); await page.waitForFunction(() => document.querySelectorAll('#preview .grid').length === 2);
    assert.equal(await page.locator('#preview').innerText().then(text => text.includes(':::')), false, 'Nested columns aliases render in handouts'); await undo(handout);
    await save(); await page.getByRole('button', { name: 'Close handout.md', exact: true }).click(); await save();
    await page.getByRole('button', { name: 'Close deck.md', exact: true }).click();
    await waitEnabled('heading', false); await waitEnabled('image', false); await waitEnabled('background', false);
    await command('new-handout'); await waitEnabled('heading', true); await waitEnabled('image', false);
    await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, path.join(root, 'new.md'));
    await save(); await waitEnabled('image', true); assert((await fs.readFile(path.join(root, 'new.md'), 'utf8')).includes('Handout title'));
    assert.deepEqual(errors, []);
    console.log('Native Insert menu updates by format/tab/save state; shared syntax, dialogs, links, image reference/import, cancellation, Undo, and renderer guards passed');
  } finally {
    if (application) await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
