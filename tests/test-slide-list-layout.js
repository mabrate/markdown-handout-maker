'use strict';
const assert = require('assert/strict');
const Zip = require('jszip');
const slides = require('../renderer/slides');
const { buildPresentation } = require('../electron/slidesExport');
const prefix = '---\ntype: slides\n---\n# List layouts\n\n';
const source = (options = '', items = '1. First **bold** item.\n2. Second item.') => prefix + `:::list ${options}\n${items}\n:::\n\nAfter the list.\n`;
const markers = scene => scene.elements.filter(element => element.listMarker);
const apply = (text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end);

(async () => {
  for (const aspect of ['16:9', '4:3']) for (const columns of [1, 2, 3, 4]) {
    const count = columns === 1 ? 3 : columns * 2 + 1, text = source(`columns=${columns} number-color=#2563eb gap=small`, Array.from({ length: count }, (_, i) => `${i + 1}. Item ${i + 1}`).join('\n')).replace('type: slides', `type: slides\naspect: ${aspect}`);
    const scene = slides.scene(slides.parse(text), 0), numbers = markers(scene);
    assert.equal(numbers.length, count); assert.deepEqual(scene.warnings, []);
    assert(numbers.every(element => element.color === '2563EB' && element.fontSize === 46));
    for (let n = 0; n < numbers.length; n++) {
      assert.equal(slides.plain(numbers[n].runs), String(n + 1));
      assert.equal(numbers[n].y, numbers[Math.floor(n / columns) * columns].y);
      if (n % columns) assert(numbers[n].x > numbers[n - 1].x);
      if (n >= columns) { assert.equal(numbers[n].x, numbers[n - columns].x); assert(numbers[n].y > numbers[n - columns].y); }
      const body = scene.elements.find(element => slides.plain(element.runs || []) === `Item ${n + 1}`);
      if (columns === 1) {
        assert.equal(numbers[n].y, body.y, 'Vertical numbers align to the top of their item');
        assert(numbers[n].x + numbers[n].w < body.x);
      } else {
        assert.equal(numbers[n].x, body.x, 'Grid numbers align with the left edge of their item');
        assert(numbers[n].y + numbers[n].h < body.y, 'Grid numbers sit above their item');
      }
      assert.equal(numbers[n].lineHeight, 1, 'Compact number leading keeps vertical number tops aligned');
    }
    const after = scene.elements.find(element => slides.plain(element.runs || []) === 'After the list.');
    assert(after.y >= Math.max(...scene.elements.filter(element => element.listLayout).map(element => element.y + element.h)));
  }
  const rich = source('columns=2 number-size=60 number-color=teal', '7. First **bold** and *italic* [link](https://example.com).\n   continued line\n\n   Another paragraph.\n\n   - Nested bullet\n   - Another nested bullet\n\n8. Last item.');
  const deck = slides.parse(rich), block = deck.slides[0].blocks[0], scene = slides.scene(deck, 0);
  assert.equal(block.items.length, 2); assert.deepEqual(block.items.map(item => item.marker), ['7', '8']);
  assert.equal(block.items[0].blocks.length, 4);
  assert(block.items[0].blocks[0].runs.some(run => run.bold));
  assert(block.items[0].blocks[0].runs.some(run => run.href));
  const paragraphs = scene.elements.filter(element => element.listLayout && !element.listMarker && element.listId === undefined);
  assert.equal(paragraphs[0].x, paragraphs[1].x, 'Continuation paragraphs align with the item text');
  assert.equal(rich.split('\n')[paragraphs[1].sourceStart].trim(), 'Another paragraph.');
  assert.equal(markers(scene)[0].color, '008080'); assert.equal(markers(scene)[0].fontSize, 60);
  assert.equal(slides.movableTextEdit(rich, paragraphs[0], scene), null, 'Do not detach part of a layout with Position freely');

  const bullets = slides.scene(slides.parse(source('columns=2 number-size=90 number-color=red', '- First\n- Second')), 0);
  assert.equal(markers(bullets).length, 0, 'Unordered layouts have no markers');
  const bulletBodies = bullets.elements.filter(element => element.listLayout);
  assert.equal(bulletBodies[0].x, .62);
  assert.equal(bulletBodies[0].w, (bullets.width - 2 * .62 - .4) / 2, 'No marker indentation is reserved');
  assert(bulletBodies.every(element => element.fontSize === 23 && element.color === bullets.theme.ink));
  const defaultScene = slides.scene(slides.parse(source()), 0);
  assert.equal(markers(defaultScene)[0].color, defaultScene.theme.accent);
  const dark = slides.scene(slides.parse(source().replace('type: slides', 'type: slides\ntheme: dark')), 0);
  assert.equal(markers(dark)[0].color, dark.theme.accent);
  assert.equal(slides.parse(source()).slides[0].blocks[0].columnCount, 1);
  const overflow = slides.scene(slides.parse(source('columns=2', '1. First\n2. Second\n3. Third')), 0);
  assert.equal(markers(overflow).length, 3); assert.deepEqual(overflow.warnings, []);
  const invalid = slides.parse(source('columns=9 gap=tiny number-size=NaN number-color=constructor mystery=yes'));
  assert.equal(invalid.slides[0].warnings.length, 5); assert.doesNotThrow(() => slides.scene(invalid, 0));
  for (const value of ['0', '-1', '1.5', '2px', 'NaN', '']) {
    const invalidColumns = slides.parse(source(`columns=${value}`));
    assert(invalidColumns.slides[0].warnings.length);
    assert.equal(invalidColumns.slides[0].blocks[0].columnCount, 1);
  }
  for (const [layout, columns] of [['vertical', 1], ['1x2', 2], ['2x3', 3], ['2x4', 4]]) {
    const legacyText = source(`layout=${layout}`), legacyBlock = slides.parse(legacyText).slides[0].blocks[0];
    assert.equal(legacyBlock.columnCount, columns);
    const migrated = apply(legacyText, slides.listLayoutEdit(legacyText, legacyBlock, { gap: 'small' }));
    assert(!migrated.includes('layout=')); assert(migrated.includes(`columns=${columns}`));
    assert.equal(slides.parse(migrated).slides[0].blocks[0].columnCount, columns);
  }
  for (const body of ['', 'Plain text.', '1. One\n\nOutside text.', '1. One\n\n- Other list']) {
    const malformed = slides.parse(source('', body));
    assert(malformed.slides[0].warnings.some(warning => warning.includes('needs one Markdown')));
    assert.doesNotThrow(() => slides.scene(malformed, 0));
  }
  const unclosed = slides.parse(prefix + ':::list\n1. First');
  assert(unclosed.slides[0].warnings.some(warning => warning.includes('missing its closing')));
  assert.equal(markers(slides.scene(unclosed, 0)).length, 1);
  const nested = slides.parse(prefix + ':::columns\n:::column\n:::list columns=2\n1. One\n2. Two\n:::\n:::column\nOther column\n:::\n');
  assert.equal(markers(slides.scene(nested, 0)).length, 2);
  assert.equal(slides.overflowEdit(source(), 0, 'columns'), null);
  const crowded = source('columns=1', Array.from({ length: 6 }, (_, i) => `${i + 1}. Item ${i + 1}`).join('\n'));
  const fitted = slides.scene(slides.parse(apply(crowded, slides.overflowEdit(crowded, 0, 'fit'))), 0);
  assert(fitted.textScale < 1); assert.equal(fitted.overflow, false);
  assert.equal(markers(fitted)[0].fontSize, 46 * fitted.textScale);

  for (const eol of ['\n', '\r\n']) {
    const text = rich.replace(/\n/g, eol), current = slides.parse(text).slides[0].blocks[0];
    const edited = apply(text, slides.listLayoutEdit(text, current, { columns: 1, 'number-color': '#f80', 'number-size': 50, gap: 'large' }));
    assert.equal(edited.slice(edited.indexOf(eol + '7.')), text.slice(text.indexOf(eol + '7.')));
    const updated = slides.parse(edited).slides[0].blocks[0];
    assert.equal(updated.columnCount, 1); assert.equal(updated.numberColor, 'FF8800'); assert.equal(updated.numberSize, 50); assert.equal(updated.gap, 'large');
    const cleared = apply(edited, slides.listLayoutEdit(edited, updated, { 'number-color': '', 'number-size': '' }));
    assert.equal(slides.parse(cleared).slides[0].blocks[0].numberColor, null);
    assert.equal(slides.parse(cleared).slides[0].blocks[0].numberSize, null);
    assert.equal(slides.listLayoutEdit(text, current, { 'number-size': 999 }), null);
    assert.equal(slides.listLayoutEdit(text, current, { columns: 9 }), null);
    assert.equal(slides.listLayoutEdit(text, current, { 'number-color': 'constructor' }), null);
  }

  const zip = await Zip.loadAsync((await buildPresentation(rich)).buffer);
  const xml = await zip.file('ppt/slides/slide1.xml').async('string');
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  const largeNumbers = shapes.filter(shape => /<a:t>[78]<\/a:t>/.test(shape));
  assert.equal(largeNumbers.length, 2);
  for (const shape of largeNumbers) { assert.match(shape, /sz="6000"/); assert.match(shape, /008080/); assert(!/<a:buAutoNum/.test(shape)); }
  assert.match(xml, /hlinkClick/); assert.match(xml, /Another paragraph/); assert.match(xml, /<a:buChar/);
  assert.match(xml, /typeface="Trebuchet MS"/);
  for (const shape of largeNumbers) { assert.match(shape, /<a:spcPct val="100000"/); }
  const result = await buildPresentation(source('columns=2 number-color=purple'));
  assert.deepEqual(result.deck.slides[0].warnings, []);
  assert.equal(slides.themes.classroom.font, 'Trebuchet MS');
  assert.equal(slides.themes.light.font, 'Arial'); assert.equal(slides.themes.dark.font, 'Arial');
  const positioned = slides.scene(slides.parse(prefix + ':::text\nTheme font\n:::'), 0).elements.find(element => element.positioned);
  assert.equal(positioned.font, null, 'Positioned text inherits the theme unless a font is explicitly set');
  const explicit = slides.scene(slides.parse(prefix + ':::text font=TrebuchetMS\nExplicit font\n:::'), 0).elements.find(element => element.positioned);
  assert.equal(explicit.font, 'Trebuchet MS');
  const weightedText = source('columns=3 widths=2in,4in,2in align=center', '1. Left\n2. Middle\n3. Right\n4. Next left\n5. Next middle\n6. Next right');
  const weightedDeck = slides.parse(weightedText), weighted = slides.scene(weightedDeck, 0);
  const weightedBodies = weighted.elements.filter(element => element.listLayout && !element.listMarker);
  assert.equal(weightedBodies[1].w, weightedBodies[0].w * 2); assert.equal(weightedBodies[0].w, weightedBodies[2].w);
  assert.equal(weightedBodies[3].x, weightedBodies[0].x); assert.equal(weightedBodies[4].w, weightedBodies[1].w);
  for (const [n, number] of markers(weighted).entries()) {
    const body = weightedBodies[n];
    assert.equal(number.align, 'center'); assert.equal(body.align, number.align);
    assert.equal(number.x, body.x); assert.equal(number.w, body.w);
  }
  assert(slides.parse(source('columns=2 widths=2.54cm,25.4mm align=center')).slides[0].blocks[0].widths.every(value => Math.abs(value - 1) < 1e-6));
  assert.equal(slides.parse(source('columns=2 widths=2,4 align=center')).slides[0].blocks[0].align, 'center');
  assert.deepEqual(slides.parse(source('columns=2 widths=2,4')).slides[0].blocks[0].widths, [2, 4]);
  for (const align of ['center', 'right']) for (const items of ['1. Short\n2. Also short', '- Short\n- Also short']) {
    const aligned = slides.scene(slides.parse(source(`align=${align}`, items)), 0);
    const number = markers(aligned)[0], body = aligned.elements.find(element => slides.plain(element.runs || []) === 'Short');
    assert.equal(body.align, align);
    if (number) {
      assert.equal(number.align, align);
      assert(number.x > .62, 'Inline numbers move with the aligned text group');
      assert(number.x + number.w < body.x); assert.equal(number.y, body.y);
    } else { assert.equal(body.x, .62); assert.equal(body.w, aligned.width - 1.24); }
    if (align === 'right') assert(Math.abs(body.x + body.w - (aligned.width - .62)) < 1e-6);
  }
  for (const options of ['columns=3 widths=1,2', 'columns=2 widths=1,0', 'columns=2 widths=1/0,1', 'columns=2 widths=10%,2in', 'columns=2 align=left,center,right', 'columns=2 align=top']) {
    assert(slides.parse(source(options)).slides[0].warnings.length, options);
  }
  const weightedBlock = weightedDeck.slides[0].blocks[0];
  const narrow = apply(weightedText, slides.listLayoutEdit(weightedText, weightedBlock, { columns: 2 }));
  const narrowedBlock = slides.parse(narrow).slides[0].blocks[0];
  assert.deepEqual(narrowedBlock.widths, [2, 4]); assert.equal(narrowedBlock.align, 'center');
  const equal = apply(narrow, slides.listLayoutEdit(narrow, narrowedBlock, { widths: '', align: 'right' }));
  assert.equal(slides.parse(equal).slides[0].blocks[0].widths, null);
  assert.equal(slides.listLayoutEdit(weightedText, weightedBlock, { widths: '1,2' }), null);
  assert.equal(slides.listLayoutEdit(weightedText, weightedBlock, { align: 'left,top,right' }), null);
  const weightedZip = await Zip.loadAsync((await buildPresentation(weightedText)).buffer);
  const weightedXml = await weightedZip.file('ppt/slides/slide1.xml').async('string');
  assert.match(weightedXml, /algn="ctr"/);
  const unmarkedXml = await (await Zip.loadAsync((await buildPresentation(source('columns=2', '- First\n- Second'))).buffer)).file('ppt/slides/slide1.xml').async('string');
  assert(!unmarkedXml.includes('<a:buChar') && !unmarkedXml.includes('<a:t>•</a:t>'), 'PowerPoint does not add bullets to unordered list layouts');
  assert(slides.scene(slides.parse(source('columns=2 widths=9in,9in')), 0).warnings.some(warning => warning.includes('slide width')));
  const centeredImages = slides.scene(slides.parse(prefix + ':::list columns=2 widths=3in,4in align=right\n1. First\n\n   ![One](one.png){width=1in}\n\n2. Second\n\n   ![Two](two.png){width=2in}\n:::\n'), 0, new Map([['one.png', { width: 100, height: 100 }], ['two.png', { width: 200, height: 100 }]]));
  const imageMarkers = markers(centeredImages), images = centeredImages.elements.filter(element => element.type === 'image');
  for (let n = 0; n < 2; n++) assert(Math.abs(images[n].x + images[n].w / 2 - imageMarkers[n].x - imageMarkers[n].w / 2) < 1e-6, 'Images stay centered even when text aligns right');
  const crowdedPicture = slides.scene(slides.parse(prefix + ('Paragraph.\n\n'.repeat(12)) + '![Visible](one.png)'), 0);
  assert(crowdedPicture.elements.find(element => element.type === 'image').h >= .75);
  assert(crowdedPicture.overflow);

  const twelve = Array.from({ length: 12 }, (_, n) => `${n + 1}. **Item ${n + 1}**\n\n    Continuation paragraph.\n\n    - Nested bullet\n\n    \`\`\`text\n    1. Keep this literal\n    \`\`\``).join('\n\n');
  for (const eol of ['\n', '\r\n']) for (const input of [rich, source('columns=3 widths=1,2,1 align=center', twelve), source('', '1.\tWith tab\n\n\tContinuation\n\n2.\tSecond'), source('', '1.\n2. Second')]) {
    const original = input.replace(/\n/g, eol), originalBlock = slides.parse(original).slides[0].blocks[0];
    const converted = apply(original, slides.listTypeEdit(original, originalBlock, false)), convertedBlock = slides.parse(converted).slides[0].blocks[0];
    assert(convertedBlock.items.every(item => !item.ordered));
    assert.deepEqual(convertedBlock.items.map(item => item.blocks), originalBlock.items.map(item => item.blocks), 'Preserve item contents, nesting, code, and source lines');
    assert.equal(converted.slice(converted.indexOf(eol + 'After the list.')), original.slice(original.indexOf(eol + 'After the list.')));
    const restored = apply(converted, slides.listTypeEdit(converted, convertedBlock, true)), restoredBlock = slides.parse(restored).slides[0].blocks[0];
    assert(restoredBlock.items.every(item => item.ordered));
    assert.deepEqual(restoredBlock.items.map(item => item.marker), originalBlock.items.map((_, n) => String(n + 1)));
    assert.deepEqual(restoredBlock.items.map(item => item.blocks), originalBlock.items.map(item => item.blocks));
    if (eol === '\r\n') assert.equal(restored.replace(/\r\n/g, '').includes('\n'), false);
    assert.equal(slides.listTypeEdit(original, originalBlock, true), null);
  }
  const noNewline = source().trimEnd(), noNewlineBlock = slides.parse(noNewline).slides[0].blocks[0];
  assert.equal(apply(noNewline, slides.listTypeEdit(noNewline, noNewlineBlock, false)).endsWith('\n'), false);
  for (const aspect of ['16:9', '4:3']) for (const shared of ['2in', '5.08cm', '50.8mm', '192px', '2']) {
    const sharedText = source(`columns=3 widths=${shared} align=center`, '1. One\n2. Two\n3. Three').replace('type: slides', `type: slides\naspect: ${aspect}`);
    const sharedDeck = slides.parse(sharedText), sharedScene = slides.scene(sharedDeck, 0), numbers = markers(sharedScene);
    assert.deepEqual(sharedScene.warnings, []);
    assert(sharedDeck.slides[0].blocks[0].widths.every(value => Math.abs(value - 2) < 1e-6));
    assert(Math.abs((numbers[0].x + numbers[2].x + numbers[2].w) / 2 - sharedScene.width / 2) < 1e-6, 'The entire grid is centered on the slide');
    const moreColumns = apply(sharedText, slides.listLayoutEdit(sharedText, sharedDeck.slides[0].blocks[0], { columns: 4 }));
    const expanded = slides.parse(moreColumns).slides[0].blocks[0];
    assert.equal(expanded.customWidths, shared); assert.equal(expanded.widths.length, 4); assert(expanded.widths.every(value => Math.abs(value - 2) < 1e-6));
  }
  for (const eol of ['\n', '\r\n']) for (const heading of ['# List layouts', '## List layouts', 'List layouts\n============']) {
    const original = (prefix.replace('# List layouts', heading) + ':::list columns=3 widths=2in align=center\n1. One\n2. Two\n3. Three\n:::\n').replace(/\n/g, eol);
    const before = slides.scene(slides.parse(original), 0), originalHeading = before.elements.find(element => element.heading);
    const centered = apply(original, slides.headingAlignmentEdit(original, originalHeading, 'center'));
    const after = slides.scene(slides.parse(centered), 0), title = after.elements.find(element => element.heading);
    assert.equal(title.align, 'center'); assert.equal(title.fontSize, originalHeading.fontSize); assert.equal(title.color, originalHeading.color);
    assert.equal(markers(before)[0].y, markers(after)[0].y, 'Centering the headline does not move the grid up or down');
    assert(markers(after)[0].y > title.y + title.h);
    assert.equal(slides.headingAlignmentEdit(centered, title, 'center'), null);
    assert.equal(apply(centered, slides.headingAlignmentEdit(centered, title, 'left')), original);
    if (eol === '\r\n') assert.equal(centered.replace(/\r\n/g, '').includes('\n'), false);
  }
  const centeredExport = '---\ntype: slides\n---\n:::center\n# Centered headline\n:::\n\n:::list columns=3 widths=2in align=center\n1. One\n2. Two\n3. Three\n:::';
  const centeredZip = await Zip.loadAsync((await buildPresentation(centeredExport)).buffer), centeredXml = await centeredZip.file('ppt/slides/slide1.xml').async('string');
  const headlineShape = centeredXml.match(/<p:sp>[\s\S]*?<\/p:sp>/g).find(shape => shape.includes('Centered headline'));
  assert.match(headlineShape, /algn="ctr"/); assert.match(headlineShape, /sz="3400"/);
  const imageLayout = slides.imageTextEdit(centeredExport.slice(0, centeredExport.indexOf(':::list')) + 'A short explanation.\n\n![Example](picture.png)', 0);
  assert(imageLayout); assert.match(imageLayout.text, /:::center\n# Centered headline\n:::/);
  console.log('Slide list layouts: all grids, vertical lists, rich items, source mapping, properties, fitting, validation, and editable PowerPoint passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
