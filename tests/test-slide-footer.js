const assert = require('node:assert/strict');
const slides = require('../renderer/slides');
const source = `---
type: slides
---
# First

:::footer height=0.8 size=18 color=white background=navy persist=true
![Logo](logo.png)

First paragraph

Second paragraph
:::
---
# Second
---
# Hidden
:::footer hidden=true
:::
---
# Resumed
---
# Stop
:::footer hidden=true persist=true
:::
---
# Last
`;
const deck=slides.parse(source);
const dims=new Map([['logo.png',{width:200,height:100}]]);
const first=slides.scene(deck,0,dims), inherited=slides.scene(deck,1,dims);
const items=first.elements.filter(e=>e.footer && e.type!=='shape');
assert.equal(items.length,3);
assert(items[0].x+items[0].w <= items[1].x);
assert(items[1].x+items[1].w <= items[2].x);
assert.equal(items[0].w/items[0].h,2);
assert.equal(items[1].color,'FFFFFF');
assert.equal(inherited.elements.filter(e=>e.footer).length,4);
assert.equal(slides.scene(deck,2).elements.filter(e=>e.footer).length,0);
assert.equal(slides.scene(deck,3).elements.filter(e=>e.footer).length,4);
assert.equal(slides.scene(deck,4).elements.filter(e=>e.footer).length,0);
assert.equal(slides.scene(deck,5).elements.filter(e=>e.footer).length,1); // original slide number
assert(!first.warnings.length);
assert(!first.elements.some(e=>e.runs?.some(r=>r.text.includes(':::footer'))));
const invalid=slides.parse(source.replace('height=0.8','height=bad mystery=yes'));
assert(invalid.slides[0].warnings.some(w=>w.includes('Invalid footer height')));
assert(invalid.slides[0].warnings.some(w=>w.includes('Unknown footer option')));
assert.equal(slides.parse(source.replace('persist=true','persist=false')).slides[1].footer,null);
console.log('Footer parsing, horizontal layout, image sizing, persistence, hiding, and validation passed');

const inlineSource = source.replace('![Logo](logo.png)\n\nFirst paragraph', '![Logo](logo.png)\nFirst paragraph');
const inlineItems = slides.scene(slides.parse(inlineSource), 0, dims).elements.filter(e => e.footer && e.type !== 'shape');
assert.equal(inlineItems[0].type, 'image');
assert.equal(inlineItems[1].runs.map(r => r.text).join('').trim(), 'First paragraph');
assert.equal(inlineItems[0].x, .62);
const reversed = inlineSource.replace('![Logo](logo.png)\nFirst paragraph', '**Before** ![Logo](logo.png) *After*');
const ordered = slides.parse(reversed).slides[0].footer.blocks;
assert(ordered[0].runs.some(r => r.text === 'Before' && r.bold));
assert.equal(ordered[1].type, 'image');
assert(ordered[2].runs.some(r => r.text === 'After' && r.italic));
for (const align of ['center', 'right']) {
 const aligned = slides.scene(slides.parse(source.replace('height=0.8', `align=${align} height=0.8`)), 0, dims);
 assert(aligned.elements.find(e => e.footer && e.type === 'image').x > .62);
}
const footerBlock=deck.slides[0].footer;
const edit=slides.footerEdit(source,footerBlock,{height:1.2,align:'right',persist:false});
const edited=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
assert.equal(slides.parse(edited).slides[0].footer.height,1.2);
assert.equal(slides.parse(edited).slides[0].footer.align,'right');
assert.equal(slides.parse(edited).slides[1].footer,null);
assert.equal(edited.slice(edited.indexOf('\n![Logo]')),source.slice(source.indexOf('\n![Logo]')));
assert.equal(slides.footerEdit(source,footerBlock,{height:99}),null);
assert.equal(slides.footerEdit(source,footerBlock,{color:'invalid'}),null);
const cleared=slides.footerEdit(source,footerBlock,{background:''});
assert(!cleared.text.includes('background='));

const reportedFooter = `:::footer color=white background=#175A80 persist=true height=0.8 size=38
**Objective: **Share our encryption systems.

**Close: **"One way I could improve my system is _____."
:::`;
const reportedSource = `---\ntype: slides\n---\n# Lesson\n\n${reportedFooter}\n\n---\n# Next lesson\n`;
const reportedDeck = slides.parse(reportedSource);
for (const index of [0, 1]) {
  const scene = slides.scene(reportedDeck, index);
  const background = scene.elements.find(e => e.footer && e.type === 'shape');
  const text = scene.elements.filter(e => e.footer && e.type === 'text');
  assert(text[0].runs.some(r => r.text === 'Objective: ' && r.bold));
  assert(text[1].runs.some(r => r.text === 'Close: ' && r.bold));
  assert(text.every(e => e.fontSize === 38), 'Explicit footer sizes must not be silently reduced');
  assert(background.h > .8, 'The footer grows to fit the selected text size');
  assert(text.every(e => e.y >= background.y && e.y + e.h <= 7.5));
  assert.deepEqual(scene.warnings, []);
}
for (const size of [8, 16, 28, 38, 48]) {
  const editedSource = reportedSource.replace('size=38', `size=${size}`);
  const text = slides.scene(slides.parse(editedSource), 0).elements.filter(e => e.footer && e.type === 'text');
  assert(text.every(e => e.fontSize === size));
}
for (const [markup, property] of [['*italic *', 'italic'], ['_italic _', 'italic'], ['__bold __', 'bold'], ['**bold** and **more**', 'bold'], ['***both ***', 'bold']]) {
  const input = reportedSource.replace(reportedFooter, `:::footer\n${markup}\n:::`);
  const runs = slides.parse(input).slides[0].footer.blocks[0].runs;
  assert(runs.some(r => r[property]));
  assert(!slides.plain(runs).includes('*') && !slides.plain(runs).includes('_'));
}
const literalSource = reportedSource.replace(reportedFooter, ':::footer\n`**literal **` \\*escaped\\* [link](https://example.com)\n:::');
const literalRuns = slides.parse(literalSource).slides[0].footer.blocks[0].runs;
assert(literalRuns.some(r => r.text === '**literal **' && r.code && !r.bold));
assert(literalRuns.some(r => r.text.includes('*escaped*') && !r.italic));
assert(literalRuns.some(r => r.href === 'https://example.com'));
assert.equal(slides.plain(slides.blocksFromMarkdown('**Objective: **Text')[0].runs), '**Objective: **Text', 'Relaxed emphasis is footer-specific');
const fencedFooter = reportedSource.replace(reportedFooter, ':::footer\n```md\n**literal **\n```\n:::');
assert.equal(slides.parse(fencedFooter).slides[0].footer.blocks[0].runs[0].text, '**literal **');
const tooLong = reportedSource.replace('Share our encryption systems.', 'Long text '.repeat(500));
const longScene = slides.scene(slides.parse(tooLong), 0);
assert(longScene.warnings.some(w => w.includes('Footer text does not fit')));
assert(longScene.elements.filter(e => e.footer && e.type === 'text').every(e => e.fontSize === 38));
console.log('Footer emphasis, literal code and escapes, explicit sizes, expanding height, inheritance, and overflow passed');

(async () => {
  const { buildPresentation } = require('../electron/slidesExport');
  const Zip = require('jszip');
  const { buffer } = await buildPresentation(reportedSource);
  const zip = await Zip.loadAsync(buffer);
  for (const index of [1, 2]) {
    const xml = await zip.file(`ppt/slides/slide${index}.xml`).async('string');
    const runs = xml.match(/<a:r>[\s\S]*?<\/a:r>/g);
    for (const label of ['Objective: ', 'Close: ']) {
      assert(runs.some(run => run.includes(`<a:t>${label}</a:t>`) && /\bb="1"/.test(run)));
    }
    assert(!xml.includes('**'));
    const footerShapes = (xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || []).filter(shape => /<a:t>(Objective: |Close: )<\/a:t>/.test(shape));
    assert.equal(footerShapes.length, 2);
    assert(footerShapes.every(shape => /\bsz="3800"/.test(shape)));
  }
  console.log('PowerPoint footer bold formatting and 38 pt size passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
