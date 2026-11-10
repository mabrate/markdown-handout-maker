'use strict';
const path = require('path').posix;
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { Resvg } = require('@resvg/resvg-js');
const { imageSize } = require('image-size');

const ns = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  svg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
};
const elements = (doc, space, name) => Array.from(doc.getElementsByTagNameNS(space, name));
const targetPath = (part, target) => path.normalize(path.join(path.dirname(part), target));

// Work around PptxGenJS 4.0.1 package defects here rather than patching node_modules.
// Retain native slide objects, original SVGs, and all speaker notes.
async function compatiblePresentation(buffer) {
  const zip = await JSZip.loadAsync(buffer), serializer = new XMLSerializer();
  async function readXml(name) {
    const file = zip.file(name);
    if (!file) throw Error(`PowerPoint export is missing ${name}.`);
    return new DOMParser({ onError: (level, message) => { throw Error(`${name}: ${message}`); } })
      .parseFromString(await file.async('string'), 'application/xml');
  }
  const writeXml = (name, doc) => zip.file(name, serializer.serializeToString(doc));
  const types = await readXml('[Content_Types].xml');
  // https://github.com/gitbrent/PptxGenJS/issues/1444
  for (const entry of elements(types, ns.ct, 'Override')) {
    const name = entry.getAttribute('PartName').slice(1);
    if (/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(name) && !zip.file(name)) entry.parentNode.removeChild(entry);
  }

  // A notes master needs its own theme when presentation.xml uses schema order.
  // Keep the six notes placeholders; removing them damages notes-page editing.
  // https://github.com/gitbrent/PptxGenJS/issues/1443
  const masterRels = await readXml('ppt/slideMasters/_rels/slideMaster1.xml.rels');
  const slideThemes = new Set(elements(masterRels, ns.rel, 'Relationship')
    .filter(rel => rel.getAttribute('Type').endsWith('/theme'))
    .map(rel => targetPath('ppt/slideMasters/slideMaster1.xml', rel.getAttribute('Target'))));
  const notesRelsName = 'ppt/notesMasters/_rels/notesMaster1.xml.rels';
  const notesRels = await readXml(notesRelsName);
  for (const rel of elements(notesRels, ns.rel, 'Relationship').filter(rel => rel.getAttribute('Type').endsWith('/theme'))) {
    const source = targetPath('ppt/notesMasters/notesMaster1.xml', rel.getAttribute('Target'));
    if (!slideThemes.has(source)) continue;
    let index = 2;
    while (zip.file(`ppt/theme/theme${index}.xml`)) index++;
    const destination = `ppt/theme/theme${index}.xml`;
    zip.file(destination, await zip.file(source).async('nodebuffer'));
    rel.setAttribute('Target', `../theme/theme${index}.xml`);
    const entry = types.createElementNS(ns.ct, 'Override');
    entry.setAttribute('PartName', '/' + destination);
    entry.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.theme+xml');
    types.documentElement.appendChild(entry);
  }
  writeXml(notesRelsName, notesRels);
  const presentation = await readXml('ppt/presentation.xml');
  const notes = elements(presentation, ns.p, 'notesMasterIdLst')[0];
  const slides = elements(presentation, ns.p, 'sldIdLst')[0];
  if (notes && slides) presentation.documentElement.insertBefore(notes, slides);
  writeXml('ppt/presentation.xml', presentation);

  const fallbacks = new Map();
  for (const file of Object.values(zip.files).filter(file => /^ppt\/slides\/slide\d+\.xml$/.test(file.name))) {
    const slide = await readXml(file.name);
    // Tables use a separate upstream ID counter that can collide with text/images.
    // Only reassign table IDs, preserving media IDs referenced by timing elements.
    const objects = elements(slide, ns.p, 'cNvPr'), counts = new Map();
    let nextId = Math.max(1, ...objects.map(node => Number(node.getAttribute('id')))) + 1;
    for (const node of objects) counts.set(node.getAttribute('id'), (counts.get(node.getAttribute('id')) || 0) + 1);
    for (const node of objects) {
      if (counts.get(node.getAttribute('id')) > 1 && node.parentNode.localName === 'nvGraphicFramePr'
        && elements(node.parentNode.parentNode, ns.a, 'tbl').length) node.setAttribute('id', String(nextId++));
    }

    const svgPictures = elements(slide, ns.p, 'pic').filter(pic => elements(pic, ns.svg, 'svgBlip').length);
    if (svgPictures.length) {
      const rels = await readXml(`${path.dirname(file.name)}/_rels/${path.basename(file.name)}.rels`);
      const targets = new Map(elements(rels, ns.rel, 'Relationship').map(rel => [rel.getAttribute('Id'), targetPath(file.name, rel.getAttribute('Target'))]));
      for (const picture of svgPictures) {
        const svg = elements(picture, ns.svg, 'svgBlip')[0], blip = elements(picture, ns.a, 'blip')[0];
        const source = targets.get(svg.getAttributeNS(ns.r, 'embed'));
        const fallback = targets.get(blip.getAttributeNS(ns.r, 'embed'));
        if (!source || !fallback || source === fallback) throw Error('PowerPoint SVG image relationships are invalid.');
        if (!fallbacks.has(source)) {
          try {
            const bytes = await zip.file(source).async('nodebuffer'), size = imageSize(bytes);
            // Bound both dimensions to 4096px, with enough detail for small QR codes.
            const width = Math.max(1, Math.floor(Math.min(Math.max(512, size.width * 2), 4096, 4096 * size.width / size.height)));
            const renderer = new Resvg(bytes, { fitTo: { mode: 'width', value: width } });
            fallbacks.set(source, renderer.render().asPng());
          } catch (error) { throw Error(`Cannot create PowerPoint preview for ${source}: ${error.message}`); }
        }
        // Upstream writes SVG bytes (or a broken-image icon) into this .png part.
        zip.file(fallback, fallbacks.get(source));
      }
    }
    writeXml(file.name, slide);
  }
  writeXml('[Content_Types].xml', types);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { compatiblePresentation };
