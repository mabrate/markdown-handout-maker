'use strict';
const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const Zip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const { Resvg } = require('@resvg/resvg-js');
const qrcode = require('qrcode-generator');
const { imageSize } = require('image-size');
const { buildPresentation } = require('../electron/slidesExport');

const ns = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  svg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
};
const elements = (doc, space, name) => Array.from(doc.getElementsByTagNameNS(space, name));
const parse = xml => new DOMParser({ onError: (level, message) => { throw Error(`${level}: ${message}`); } }).parseFromString(xml, 'application/xml');
const targetPath = (part, target) => path.posix.normalize(path.posix.join(path.posix.dirname(part), target));

async function inspectPackage(buffer) {
  const zip = await Zip.loadAsync(buffer), docs = new Map();
  for (const file of Object.values(zip.files).filter(file => /\.(xml|rels)$/.test(file.name))) docs.set(file.name, parse(await file.async('string')));
  for (const override of elements(docs.get('[Content_Types].xml'), ns.ct, 'Override')) {
    assert(zip.file(override.getAttribute('PartName').slice(1)), `Missing declared part: ${override.getAttribute('PartName')}`);
  }
  for (const [name, doc] of docs) {
    if (name.endsWith('.rels')) {
      const source = name === '_rels/.rels' ? '' : name.replace(/_rels\/([^/]+)\.rels$/, '$1');
      const rels = elements(doc, ns.rel, 'Relationship');
      assert.equal(new Set(rels.map(rel => rel.getAttribute('Id'))).size, rels.length, `${name}: unique relationship IDs`);
      for (const rel of rels) if (rel.getAttribute('TargetMode') !== 'External') {
        assert(zip.file(targetPath(source, rel.getAttribute('Target'))), `${name}: missing relationship target`);
      }
      const sourceDoc = docs.get(source), ids = new Set(rels.map(rel => rel.getAttribute('Id')));
      if (sourceDoc) for (const node of elements(sourceDoc, '*', '*')) {
        for (const attribute of ['id', 'embed', 'link']) {
          const id = node.getAttributeNS(ns.r, attribute);
          if (id) assert(ids.has(id), `${source}: unresolved relationship ${id}`);
        }
      }
    }
    if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) {
      const ids = elements(doc, ns.p, 'cNvPr').map(node => node.getAttribute('id'));
      assert.equal(new Set(ids).size, ids.length, `${name}: unique object IDs`);
    }
  }
  const presentation = docs.get('ppt/presentation.xml');
  const order = Array.from(presentation.documentElement.childNodes).filter(node => node.nodeType === 1).map(node => node.localName);
  assert(order.indexOf('notesMasterIdLst') < order.indexOf('sldIdLst'), 'Notes master list follows schema order');
  const themes = part => elements(docs.get(part), ns.rel, 'Relationship').filter(rel => rel.getAttribute('Type').endsWith('/theme')).map(rel => rel.getAttribute('Target'));
  assert.notEqual(themes('ppt/notesMasters/_rels/notesMaster1.xml.rels')[0], themes('ppt/slideMasters/_rels/slideMaster1.xml.rels')[0], 'Notes and slide masters have separate themes');
  assert.equal(elements(docs.get('ppt/notesMasters/notesMaster1.xml'), ns.p, 'sp').length, 6, 'Retain notes-page placeholders');
  return { zip, docs };
}

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-compatibility-'));
  try {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVZkAAAAASUVORK5CYII=', 'base64');
    await fs.writeFile(path.join(root, 'photo.png'), png);
    await fs.writeFile(path.join(root, 'background.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="green"/></svg>');
    const url = 'https://example.com/classroom';
    const source = `---
type: slides
theme: dark
---
# Editable **title**

:::columns
:::column
![Photo](photo.png)
:::column
[qr:${url}]
:::

:::text x=10% y=75% width=80% size=28
Positioned [link](https://example.com)
:::

:::notes
Private teacher notes
:::

---
# Table

| A | B |
| --- | --- |
| 1 | 2 |

---
:::background position=right
![Background](background.svg)
:::

:::text x=10% y=10% width=80% size=32
Background text
:::
`;
    const { zip, docs } = await inspectPackage((await buildPresentation(source, { root })).buffer);
    assert.equal([...docs.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, 3);
    const firstSlide = await zip.file('ppt/slides/slide1.xml').async('string');
    assert.match(firstSlide, /Positioned /);
    assert.match(firstSlide, /hlinkClick/);
    assert.match(firstSlide, /b="1"/);
    assert.match(await zip.file('ppt/notesSlides/notesSlide1.xml').async('string'), /Private teacher notes/);
    assert.match(await zip.file('ppt/slides/slide2.xml').async('string'), /<a:tbl>/);
    const media = Object.values(zip.files).filter(file => /^ppt\/media\//.test(file.name) && !file.dir);
    let keptPhoto = false;
    for (const file of media) {
      const bytes = await file.async('nodebuffer');
      if (file.name.endsWith('.png')) assert.equal(imageSize(bytes).type, 'png', `${file.name}: actual PNG data`);
      if (bytes.equals(png)) keptPhoto = true;
    }
    assert(keptPhoto, 'Preserve original PNG bytes');
    // Check the fallback depicts every QR module, including its white quiet zone.
    // This catches both mislabeled SVG bytes and generic broken-image placeholders.
    const picture = elements(docs.get('ppt/slides/slide1.xml'), ns.p, 'pic').find(pic => elements(pic, ns.svg, 'svgBlip').length);
    const blip = picture.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
    const fallbackId = blip.getAttributeNS(ns.r, 'embed');
    const rel = elements(docs.get('ppt/slides/_rels/slide1.xml.rels'), ns.rel, 'Relationship').find(rel => rel.getAttribute('Id') === fallbackId);
    const fallback = await zip.file(targetPath('ppt/slides/slide1.xml', rel.getAttribute('Target'))).async('nodebuffer');
    const dimensions = imageSize(fallback);
    assert.equal(dimensions.width, dimensions.height);
    assert(dimensions.width >= 512 && dimensions.width <= 4096);
    const decoded = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}"><image width="100%" height="100%" href="data:image/png;base64,${fallback.toString('base64')}"/></svg>`).render();
    const qr = qrcode(0, 'H'); qr.addData(url, 'Byte'); qr.make();
    const count = qr.getModuleCount(), total = count + 8, pixels = decoded.pixels;
    for (let row = 0; row < total; row++) for (let col = 0; col < total; col++) {
      const x = Math.floor((col + .5) / total * decoded.width), y = Math.floor((row + .5) / total * decoded.height);
      const offset = (y * decoded.width + x) * 4;
      const dark = row >= 4 && col >= 4 && row < count + 4 && col < count + 4 && qr.isDark(row - 4, col - 4);
      assert.equal(pixels[offset] < 128, dark, `QR module ${row},${col}`);
      assert.equal(pixels[offset + 3], 255, 'Opaque QR background');
    }
    // Exercise consecutive exports too: the upstream image fallback bug is async.
    await inspectPackage((await buildPresentation('---\ntype: slides\n---\n# One\n\n---\n# Two')).buffer);
    console.log('PPTX package targets, unique object IDs, notes themes, editable content, SVG backgrounds, and QR fallback pixels passed');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
