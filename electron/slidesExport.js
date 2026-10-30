'use strict';
const fs = require('fs/promises');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const { imageSize } = require('image-size');
const slides = require('../renderer/slides');
const { checkedPath } = require('./fileBrowser');
const { imageExtension } = require('./assetImport');
async function imageData(src, root, documentPath) {
  let bytes;
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) bytes = Buffer.from(src.split(',')[1], 'base64');
  else {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(src)) throw Error('Slide images must use local relative filenames.');
    if (!root) throw Error('Save the deck in a lesson folder before exporting local images.');
    let decoded; try { decoded = decodeURIComponent(src); } catch { throw Error('An image filename has invalid URL encoding.'); }
    const file = await checkedPath(root, path.resolve(documentPath ? path.dirname(documentPath) : root, decoded));
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw Error('Slide images must be files smaller than 25 MB.');
    bytes = await fs.readFile(file);
  }
  if (bytes.length > 25 * 1024 * 1024) throw Error('Slide images must be smaller than 25 MB.');
  const extension = imageExtension(bytes);
  if (!extension || extension === 'webp') throw Error('PowerPoint images must be PNG, JPEG, GIF, or SVG. Convert WebP to PNG first.');
  if (extension === 'svg' && /<(?:script|foreignObject)\b|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)|\bon\w+\s*=/i.test(bytes.toString('utf8'))) throw Error('Use an SVG without scripts or external resources, or convert it to PNG.');
  return `image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}`;
}
async function buildPresentation(text, { root = null, documentPath = null } = {}) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw Error('A slide deck must be smaller than 2 MB.');
  const deck = slides.parse(text);
  if (!deck.enabled) throw Error('This document is a handout. Create a slide deck with File → New Slide Deck.');
  if (deck.slides.length > 300) throw Error('Export up to 300 slides at a time.');
  if (documentPath) documentPath = await checkedPath(root, documentPath);
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'CLASSROOM', width: deck.settings.aspect === '4:3' ? 10 : 40 / 3, height: 7.5 }); pptx.layout = 'CLASSROOM';
  pptx.author = 'The Markdown Handout Maker'; pptx.subject = 'Classroom slide deck'; pptx.title = slides.plain(deck.slides[0].outlineTitle || deck.slides[0].title) || 'Lesson slides'; pptx.lang = 'en-US';
  const theme = slides.themes[deck.settings.theme]; pptx.theme = { headFontFace: theme.font, bodyFontFace: theme.font, lang: 'en-US' };
  const images = new Map(), imageDimensions = new Map();
  async function loadImages(blocks, index) {
    for (const block of blocks) {
      if (['image', 'background'].includes(block.type)) {
        try {
          if (!images.has(block.src)) images.set(block.src, block.qrSvg ? 'image/svg+xml;base64,' + Buffer.from(block.qrSvg).toString('base64') : await imageData(block.src, root, documentPath));
          imageDimensions.set(block.src, imageSize(Buffer.from(images.get(block.src).split(',')[1], 'base64')));
        } catch (error) { throw Error(`Slide ${index + 1}, image “${block.src}”: ${error.message}`); }
      }
      if (block.blocks) await loadImages(block.blocks, index);
      if (block.columns) for (const column of block.columns) await loadImages(column, index);
      if (block.items) for (const item of block.items) await loadImages(item.blocks, index);
    }
  }
  for (const [index, slide] of deck.slides.entries()) await loadImages(slide.blocks, index);
  for (const [index, slide] of deck.slides.entries()) {
    const scene = slides.scene(deck, index, imageDimensions), page = pptx.addSlide(); page.background = { color: theme.background };
    if (slide.notes) page.addNotes(slide.notes);
    const exportedLists = new Set();
    for (const [number, element] of scene.elements.entries()) {
      const position = { x: element.x, y: element.y, w: element.w, h: element.h, objectName: `Slide ${index + 1} ${element.type} ${number + 1}` };
      if (element.listId !== undefined) {
        if (exportedLists.has(element.listId)) continue;
        exportedLists.add(element.listId);
        const list = scene.lists[element.listId], runs = [];
        for (const [itemIndex, item] of list.items.entries()) {
          const bullet = { indent: item.indent * 72 / (item.depth + 1), ...(/^\d+\.$/.test(item.bullet) ? { type: 'number', numberStartAt: Number.parseInt(item.bullet, 10) } : { characterCode: item.bullet.codePointAt(0).toString(16).padStart(4, '0') }) };
          for (const run of item.runs) {
            // Markdown line breaks continue the same bullet paragraph.
            for (const [lineIndex, text] of run.text.split('\n').entries()) runs.push({ text, options: {
              bullet, indentLevel: Math.min(8, item.depth), align: item.align, fontSize: item.fontSize,
              bold: !!(run.bold || item.bold), italic: !!run.italic,
              ...(run.code ? { fontFace: 'Courier New' } : {}), ...(run.href ? { hyperlink: { url: run.href } } : {}),
              ...(lineIndex ? { softBreakBefore: true } : {}),
              paraSpaceAfter: itemIndex < list.items.length - 1 ? (.16 + .035) * 72 : 0
            } });
          }
          if (itemIndex < list.items.length - 1) runs[runs.length - 1].options.breakLine = true;
        }
        page.addText(runs, { x: list.x, y: list.y, w: list.w, h: list.h, objectName: `Slide ${index + 1} list ${element.listId + 1}`,
          fontFace: theme.font, fontSize: list.items[0].fontSize, color: theme.ink, align: list.items[0].align,
          margin: 0, valign: 'top', lineSpacingMultiple: 1.2, paraSpaceAfter: 0, fit: 'none' });
        continue;
      }
      if (element.type === 'video') {
        if(element.provider==='youtube')page.addMedia({...position,type:'online',link:`https://www.youtube.com/embed/${element.id}${element.start?'?start='+element.start:''}`});
        else {
          try {
            if(!root)throw Error('Save the deck in its lesson folder before exporting a local video.');
            const file=await checkedPath(root,path.resolve(documentPath?path.dirname(documentPath):root,decodeURIComponent(element.src)));
            const stat=await fs.stat(file);if(!stat.isFile()||stat.size>200*1024*1024)throw Error('Use a video file smaller than 200 MB for PowerPoint export.');
            page.addMedia({...position,type:'video',path:file});
          }catch(error){throw Error(`Slide ${index+1}, video “${element.value}”: ${error.message}`);}
        }
      } else if (element.type === 'text') {
        let runs = element.runs.map(run => ({ text: run.text, options: { bold: !!(run.bold || element.bold), italic: !!run.italic, ...(run.code ? { fontFace: 'Courier New' } : {}), ...(run.href ? { hyperlink: { url: run.href }, ...(element.positioned ? { color: element.color } : {}) } : {}) } }));
        if(element.positioned && element.paragraphs?.some(paragraph=>paragraph.bullet)){
          runs=[];
          for(const [i,paragraph] of element.paragraphs.entries()){
            const bullet=paragraph.bullet ? {indent:element.fontSize,...(/^\d+\.$/.test(paragraph.bullet)?{type:'number',numberStartAt:Number.parseInt(paragraph.bullet,10)}:{characterCode:paragraph.bullet.codePointAt(0).toString(16).padStart(4,'0')})}:false;
            for(const run of paragraph.runs)for(const [lineIndex,text] of run.text.split('\n').entries())runs.push({text,options:{bullet,indentLevel:Math.min(8,paragraph.depth||0),align:element.align,fontSize:element.fontSize,bold:!!run.bold,italic:!!run.italic,...(run.code?{fontFace:'Courier New'}:{}),...(run.href?{hyperlink:{url:run.href},color:element.color}:{}),...(lineIndex?{softBreakBefore:true}:{}),paraSpaceBefore:i>0 && !(paragraph.bullet && element.paragraphs[i-1].bullet)?element.fontSize*1.2:0}});
            if(i<element.paragraphs.length-1)runs[runs.length-1].options.breakLine=true;
          }
        }
        page.addText(runs, { ...position, fontFace: element.code ? 'Courier New' : element.font || theme.font, fontSize: element.fontSize, color: element.color, align: element.align || 'left', margin: 0, breakLine: false, valign: 'top', lineSpacingMultiple: element.lineHeight || 1.2, paraSpaceAfter: 0, fit: 'none' });
      } else if (element.type === 'image') {
        try {
          if (!images.has(element.src)) images.set(element.src, await imageData(element.src, root, documentPath));
          const data = images.get(element.src), dimensions = imageSize(Buffer.from(data.split(',')[1], 'base64'));
          const scale = (element.background ? Math.max : Math.min)(element.w / dimensions.width, element.h / dimensions.height);
          const w = dimensions.width * scale, h = dimensions.height * scale;
          if (element.background && dimensions.type === 'svg') {
            // Some presentation readers ignore srcRect cropping on SVG pictures.
            // Preserve the vector image inside a slide-sized clipped viewport.
            const source = Buffer.from(data.split(',')[1], 'base64').toString('utf8');
            const svg = source.match(/<svg\b[\s\S]*<\/svg\s*>/i)?.[0];
            if (!svg) throw Error('The background SVG is missing its root element.');
            const nested = svg.replace(/<svg\b([^>]*)>/i, (_, attrs) => `<svg${attrs.replace(/\s(?:x|y|width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')} x="${(element.w - w) * element.anchor[0] * 96}" y="${(element.h - h) * element.anchor[1] * 96}" width="${w * 96}" height="${h * 96}">`);
            const covered = `<svg xmlns="http://www.w3.org/2000/svg" width="${element.w * 96}" height="${element.h * 96}" viewBox="0 0 ${element.w * 96} ${element.h * 96}">${nested}</svg>`;
            page.addImage({ ...position, data: 'image/svg+xml;base64,' + Buffer.from(covered).toString('base64'), altText: element.alt });
          } else if (element.background) page.addImage({ ...position, w, h, data, altText: element.alt,
            sizing: { type: 'crop', w: element.w, h: element.h, x: (w - element.w) * element.anchor[0], y: (h - element.h) * element.anchor[1] } });
          else page.addImage({ ...position, x: element.x + (element.w - w) / 2, y: element.y + (element.h - h) / 2, w, h, data, altText: element.alt });
        } catch (error) { throw Error(`Slide ${index + 1}, image “${element.src}”: ${error.message}`); }
      } else if (element.type === 'shape') {
        page.addShape(pptx.ShapeType.rect, { ...position, fill: { color: element.color, transparency: 100 - element.opacity }, line: { color: element.stroke || element.color, transparency: element.stroke ? 0 : 100, width:.7 } });
      } else if (element.type === 'table') {
        page.addTable(element.rows.map((row, rowIndex) => row.map((text,columnIndex) => ({ text:element.cellRuns?element.cellRuns[rowIndex][columnIndex].map(run=>({text:run.text,options:{bold:rowIndex===0||!!run.bold,italic:!!run.italic,...(run.code?{fontFace:'Courier New'}:{}),...(run.href?{hyperlink:{url:run.href}}:{})}})):text, options: { bold: rowIndex === 0,align:element.alignments?.[columnIndex]||'left' } }))), {
          ...position, fontFace: theme.font, fontSize: element.fontSize, color: theme.ink, fill: theme.background,
          border: { type: 'solid', pt: .7, color: theme.muted }, margin: [.06, .08, .06, .08],
          colW: Array(Math.max(1, ...element.rows.map(row => row.length))).fill(element.w / Math.max(1, ...element.rows.map(row => row.length))),
          autoPage: false, valign: 'top', verbose: false
        });
      }
    }
  }
  return { buffer: await pptx.write({ outputType: 'nodebuffer' }), deck };
}
module.exports = { buildPresentation, imageData };
