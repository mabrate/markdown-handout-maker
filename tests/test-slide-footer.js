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
