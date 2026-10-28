/* Shared slideshow parser and geometry. Handout parsing stays in app.js. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./vendor/markdown-it.min.js') : root.markdownit, typeof module === 'object' ? require('./qr-block') : root.HandoutQr, typeof module === 'object' ? require('./video-block') : root.HandoutVideo);
  if (typeof module === 'object') module.exports = api; else root.HandoutSlides = api;
})(typeof window === 'object' ? window : globalThis, function (MarkdownIt, qr, video) {
  'use strict';
  const markdown = new MarkdownIt({ html: false, breaks: true });
  const themes = {
    classroom: { name: 'Classroom', background: 'FFFDF7', ink: '172C3B', accent: '175A80', muted: '516776', font: 'Arial' },
    light: { name: 'Light', background: 'FFFFFF', ink: '202936', accent: '2454A4', muted: '566476', font: 'Arial' },
    dark: { name: 'Dark', background: '20252D', ink: 'F5F5EF', accent: 'FFAF63', muted: 'BBC4CF', font: 'Arial' }
  };
  function metadata(text) {
    const match = String(text).match(/^\uFEFF?---[^\S\n]*\r?\n([\s\S]*?)\r?\n---[^\S\n]*(?:\r?\n|$)/);
    const values = {};
    if (match) for (const line of match[1].split(/\r?\n/)) {
      const item = line.match(/^([\w-]+)\s*:\s*(.*?)\s*$/);
      if (item) values[item[1]] = item[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return { values, prefix: match ? match[0] : '', enabled: values.type === 'slides' };
  }
  function runsFromTokens(tokens) {
    const runs = []; let bold = false, italic = false, href;
    for (const token of tokens || []) {
      if (token.type === 'strong_open') bold = true;
      else if (token.type === 'strong_close') bold = false;
      else if (token.type === 'em_open') italic = true;
      else if (token.type === 'em_close') italic = false;
      else if (token.type === 'link_open') { const url = token.attrGet('href'); href = /^(https?:|mailto:)/i.test(url || '') ? url : undefined; }
      else if (token.type === 'link_close') href = undefined;
      else if (['text', 'code_inline', 'softbreak', 'hardbreak', 'image'].includes(token.type)) runs.push({ text: /break$/.test(token.type) ? '\n' : token.content, bold, italic, ...(href ? { href } : {}), ...(token.type === 'code_inline' ? { code: true } : {}) });
    }
    return runs;
  }
  const plain = runs => runs.map(run => run.text).join('');
  const anchors = { center: [ .5, .5 ], left: [0, .5], right: [1, .5], top: [.5, 0], bottom: [.5, 1], 'top-left': [0, 0], 'top-right': [1, 0], 'bottom-left': [0, 1], 'bottom-right': [1, 1] };
  const colors = { white: 'FFFFFF', black: '000000', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', orange: 'FFA500', gray: '808080', grey: '808080', navy: '000080', teal: '008080', purple: '800080', pink: 'FFC0CB', brown: 'A52A2A', cyan: '00FFFF', magenta: 'FF00FF' };
  function blockOptions(type, raw, warnings) {
    const allowed = type === 'background' ? ['position', 'overlay', 'opacity'] : ['x', 'y', 'width', 'size', 'color', 'align', 'font'];
    const values = {};
    for (const part of (raw || '').trim().split(/\s+/).filter(Boolean)) {
      const match = part.match(/^([\w-]+)=(\S+)$/);
      if (!match || !allowed.includes(match[1])) warnings.push(`Unknown ${type} option “${part}”.`);
      else values[match[1]] = match[2];
    }
    const number = (key, fallback, min, max, percent = false) => {
      if (values[key] === undefined) return fallback;
      const pattern = percent ? /^(?:\d+(?:\.\d*)?|\.\d+)%$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/;
      const value = Number.parseFloat(values[key]);
      if (!pattern.test(values[key]) || value < min || value > max) { warnings.push(`Invalid ${type} ${key}; use ${min}–${max}${percent ? '%' : ''}.`); return fallback; }
      return value;
    };
    if (type === 'background') {
      const position = Object.hasOwn(anchors, values.position) ? values.position : 'center';
      const overlay = ['dark', 'light', 'none'].includes(values.overlay) ? values.overlay : 'none';
      if (values.position && !Object.hasOwn(anchors, values.position)) warnings.push('Unknown background position; using center.');
      if (values.overlay && !['dark', 'light', 'none'].includes(values.overlay)) warnings.push('Unknown background overlay; use dark, light, or none.');
      return { position, overlay, opacity: number('opacity', overlay === 'none' ? 0 : 35, 0, 100) };
    }
    const value = values.color || 'white', hex = value.replace(/^#/, '');
    const color = (Object.hasOwn(colors, value.toLowerCase()) ? colors[value.toLowerCase()] : null) || (/^[\da-f]{6}$/i.test(hex) ? hex.toUpperCase() : /^[\da-f]{3}$/i.test(hex) ? [...hex].map(c => c + c).join('').toUpperCase() : null);
    if (!color) warnings.push('Invalid text color; use a color name or #RRGGBB. Using white.');
    if (values.align && !['left', 'center', 'right'].includes(values.align)) warnings.push('Invalid text alignment; using left.');
    const fonts = { Arial: 'Arial', Calibri: 'Calibri', Georgia: 'Georgia', Verdana: 'Verdana', CourierNew: 'Courier New' };
    if (values.font && !Object.hasOwn(fonts, values.font)) warnings.push('Unknown text font; using Arial.');
    return { x: number('x', 10, 0, 100, true), y: number('y', 65, 0, 100, true), width: number('width', 80, 1, 100, true), size: number('size', 54, 8, 144), color: color || 'FFFFFF', align: ['left', 'center', 'right'].includes(values.align) ? values.align : 'left', font: Object.hasOwn(fonts, values.font) ? fonts[values.font] : 'Arial' };
  }
  function mediaOptions(attributes) {
    const dimension = key => attributes.match(new RegExp(`(?:^|\\s)${key}=(\\d+(?:\\.\\d+)?(?:in|cm|mm|px|%))(?:\\s|$)`, 'i'))?.[1];
    return { mediaWidth: dimension('width'), mediaHeight: dimension('height'), mediaAlign: /(?:^|\s)\.float-right(?:\s|$)/i.test(attributes) ? 'right' : 'left' };
  }
  function lengthInches(value, parentWidth) {
    const match = String(value || '').match(/^(\d+(?:\.\d+)?)(in|cm|mm|px|%)$/i);
    if (!match) return null;
    const number = Number(match[1]), units = { in: 1, cm: 1 / 2.54, mm: 1 / 25.4, px: 1 / 96, '%': parentWidth / 100 };
    return number > 0 && Number.isFinite(number) ? number * units[match[2].toLowerCase()] : null;
  }
  function blocksFromMarkdown(text, sourceLines = text.split('\n').map((_, index) => index)) {
    const location = map => map ? { sourceStart: sourceLines[map[0]], sourceEnd: sourceLines[map[1] - 1] + 1 } : {};
    const tokens = markdown.parse(text, {}), blocks = [], lists = []; let nextListId = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'bullet_list_open') lists.push({ ordered: false, id: lists[0]?.id ?? nextListId++ });
      if (token.type === 'ordered_list_open') lists.push({ ordered: true, next: Number(token.attrGet('start') || 1), id: lists[0]?.id ?? nextListId++ });
      if (/^(bullet|ordered)_list_close$/.test(token.type)) lists.pop();
      if (token.type === 'table_open') {
        const rows = [], rowSources = [], cellRuns=[], alignments=[]; let row, richRow;
        for (++i; i < tokens.length && tokens[i].type !== 'table_close'; i++) {
          if (tokens[i].type === 'tr_open') { row = []; richRow=[];rows.push(row);cellRuns.push(richRow);rowSources.push(location(tokens[i].map)); }
          if(tokens[i].type==='th_open')alignments[row.length]=tokens[i].attrGet('style')?.match(/text-align:(left|center|right)/)?.[1]||'left';
          if (tokens[i].type === 'inline' && row) { const runs=runsFromTokens(tokens[i].children);row.push(plain(runs));richRow.push(runs); }
        }
        blocks.push({ type: 'table', rows, rowSources, cellRuns, alignments, ...location(token.map) }); continue;
      }
      if (token.type === 'fence' || token.type === 'code_block') { blocks.push({ type: 'text', runs: [{ text: token.content.replace(/\n$/, ''), code: true }], code: true, ...location(token.map) }); continue; }
      if (token.type !== 'inline') continue;
      const images = (token.children || []).filter(child => child.type === 'image');
      const imageAttributes = new Map();
      (token.children || []).forEach((child, n, children) => {
        if (child.type !== 'image') return;
        const suffix = children[n + 1]; const attributes = suffix?.type === 'text' && suffix.content.match(/^\{([^}]*)\}/);
        if (attributes) { imageAttributes.set(child, attributes[1]); suffix.content = suffix.content.slice(attributes[0].length); }
      });
      const textTokens = (token.children || []).filter(child => child.type !== 'image');
      const runs = runsFromTokens(textTokens);
      const heading = tokens[i - 1]?.type === 'heading_open' ? Number(tokens[i - 1].tag.slice(1)) : 0;
      if (plain(runs).trim()) {
        const list = lists.at(-1);
        blocks.push({ type: 'text', runs, heading, ...location(token.map), ...(list ? { bullet: list.ordered ? `${list.next++}.` : '•', depth: lists.length - 1, listId: list.id } : {}) });
      }
      for (const [mediaOccurrence, image] of images.entries()) blocks.push({ type: 'image', src: image.attrGet('src'), alt: image.content || 'Image', ...location(token.map), ...mediaOptions(imageAttributes.get(image) || ''), mediaOccurrence });
    }
    return blocks;
  }
  function elementBlocks(lines, warnings, sourceLines) {
    let index = 0;
    function read(stops = []) {
      const blocks = []; let pending = [], locations = [], fence = null;
      const append = line => { pending.push(line); locations.push(sourceLines[index]); };
      const flush = () => { blocks.push(...blocksFromMarkdown(pending.join('\n'), locations)); pending = []; locations = []; };
      while (index < lines.length) {
        const line = lines[index], code = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (code) { if (!fence) fence = code[1]; else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = null; append(line); index++; continue; }
        if (fence) { append(line); index++; continue; }
        const marker = /^:::(?:column|cell)\s*$/.test(line) ? 'column' : /^:::\s*$/.test(line) ? 'close' : null;
        if (stops.includes(marker)) { flush(); return { blocks, stop: marker }; }
        const movie = video.parse(line);
        if (movie) {
          flush();
          if (movie.error) { warnings.push(movie.error); blocks.push({type:'text',runs:[{text:movie.error}],sourceStart:sourceLines[index],sourceEnd:sourceLines[index]+1}); }
          else blocks.push({...movie,sourceStart:sourceLines[index],sourceEnd:sourceLines[index]+1});
          index++;continue;
        }
        const qrLine = line.match(/^\s*\[qr:([^\]]*)\](?:\{([^}]*)\})?\s*$/i);
        if (qrLine) {
          flush(); const result = qr.createQrSvg(qrLine[1]);
          if (result.error) { warnings.push(result.error); blocks.push({ type: 'text', runs: [{ text: result.error }], sourceStart: sourceLines[index], sourceEnd: sourceLines[index] + 1 }); }
          else blocks.push({ type: 'image', qrSvg: result.svg, qrUrl: result.url, src: 'data:image/svg+xml,' + encodeURIComponent(result.svg), alt: 'QR code for ' + result.url, ...mediaOptions(qrLine[2] || ''), sourceStart: sourceLines[index], sourceEnd: sourceLines[index] + 1 });
          index++; continue;
        }
        const special = line.match(/^:::(background|text)(?:\s+(.*?))?\s*$/);
        if (special) {
          flush(); const sourceStart = sourceLines[index], type = special[1], settings = blockOptions(type, special[2], warnings);
          index++; const result = read(['close']);
          const sourceEnd = sourceLines[Math.max(0, index - (result.stop === 'close' ? 0 : 1))] + 1;
          if (result.stop === 'close') index++; else warnings.push(`${type} block is missing its closing ::: marker.`);
          if (type === 'background') {
            const images = result.blocks.filter(block => block.type === 'image');
            if (images.length !== 1 || result.blocks.length !== 1) warnings.push('A background block needs exactly one Markdown image and no other content.');
            if (images[0]) blocks.push({ ...images[0], type: 'background', ...settings, blockStart: sourceStart, blockEnd: sourceEnd });
          } else {
            const runs = [], paragraphs = [];
            for (const block of result.blocks) {
              if (block.type !== 'text') { warnings.push('A positioned text block supports text and lists; put images, tables, and layout blocks outside it.'); continue; }
              if (runs.length) runs.push({ text: block.bullet && paragraphs.at(-1).bullet ? '\n' : '\n\n' });
              const content = block.runs.filter(run => run.text).map(run => ({ ...run, bold: !!(run.bold || block.heading), sourceStart: block.sourceStart, sourceEnd: block.sourceEnd }));
              if(block.bullet)runs.push({text:'  '.repeat(block.depth || 0)+block.bullet+' '});
              runs.push(...content);paragraphs.push({...block,runs:content});
            }
            if (!runs.length) warnings.push('A positioned text block needs some text.');
            blocks.push({ type: 'positioned-text', runs, paragraphs, ...settings, sourceStart, sourceEnd });
          }
          continue;
        }
        const grid = line.match(/^:::grid(?:\s+(.*))?\s*$/);
        const gridWidths = grid?.[1]?.match(/(?:^|\s)widths=(\S+)/)?.[1];
        const columns = (grid ? ':::columns' + (gridWidths ? ' widths=' + gridWidths : '') : line).match(/^:::columns(?:\s+widths=([^\s]+))?\s*$/);
        if (columns) {
          flush(); const sourceStart=sourceLines[index];index++; const parts = []; let started = false, closed = false;
          while (index < lines.length) {
            const part = read(['column', 'close']);
            if (part.blocks.length || started) parts.push(part.blocks);
            if (part.stop === 'column') { index++; started = true; continue; }
            if (part.stop === 'close') { index++; closed = true; } break;
          }
          if (!closed) warnings.push('Columns are missing their closing ::: marker.');
          if (!parts.length) parts.push([]);
          let widths = (columns[1] || '').split(',').map(value => { const [n, d = '1'] = value.split('/'); return Number(n) / Number(d); });
          if (!columns[1] || widths.length !== parts.length || widths.some(value => !Number.isFinite(value) || value <= 0)) {
            if (columns[1]) warnings.push('Column widths must be positive numbers or fractions, one per column.');
            widths = parts.map(() => 1);
          }
          if (parts.length > 4) warnings.push('More than four columns may be difficult to read.');
          const count=grid?.[1]?.match(/(?:^|\s)columns=(\d+)/)?.[1];if(count && Number(count)!==parts.length)warnings.push('Grid column count does not match the number of :::cell blocks.');
          blocks.push({ type: 'columns', columns: parts, widths, cards:!!grid && /(?:^|\s)cards(?:\s|$)/.test(grid[1]||''), sourceStart,sourceEnd:sourceLines[Math.max(0,index-1)]+1 }); continue;
        }
        if (/^:::(center|fit|checklist)\s*$/.test(line)) {
          const type = line.trim().slice(3);
          flush(); index++; const result = read(['close']);
          if (result.stop === 'close') index++; else warnings.push(`${type === 'fit' ? 'Fit' : 'Centered content'} block is missing its closing ::: marker.`);
          if (type === 'checklist') { for (const block of result.blocks) { if (block.bullet) block.bullet = '☐';if(block.paragraphs)for(const paragraph of block.paragraphs)if(paragraph.bullet)paragraph.bullet='☐'; } blocks.push(...result.blocks); }
          else blocks.push({ type, blocks: result.blocks }); continue;
        }
        if (/^:::/.test(line)) warnings.push('Unrecognized block marker. See Help for slide content blocks.');
        append(line); index++;
      }
      flush(); return { blocks };
    }
    return read().blocks;
  }
  function parse(text) {
    const meta = metadata(text), warnings = [];
    if (!meta.enabled) return { enabled: false, slides: [], warnings, settings: {} };
    const theme = themes[meta.values.theme] ? meta.values.theme : 'classroom';
    const aspect = meta.values.aspect === '4:3' ? '4:3' : '16:9';
    if (meta.values.theme && !themes[meta.values.theme]) warnings.push(`Unknown theme “${meta.values.theme}”; using Classroom.`);
    if (meta.values.aspect && !['4:3', '16:9'].includes(meta.values.aspect)) warnings.push('Unknown aspect ratio; using 16:9.');
    const lines = String(text).split(/\r?\n/), prefixLines = (meta.prefix.match(/\n/g) || []).length + (meta.prefix && !meta.prefix.endsWith('\n') ? 1 : 0);
    const slides = []; let current = { markerLine: -1, startLine: prefixLines, raw: [], rawSources: [], noteLines: [], noteSources: [] };
    let fence = null, notes = false;
    function finish(endLine) {
      if (!current.raw.some(line => line.trim()) && !current.noteLines.length && current.markerLine < 0) return;
      const slideWarnings = [];
      const raw = current.raw;
      let blocks = elementBlocks(raw, slideWarnings, current.rawSources);
      const flowing = blocks.filter(block => !['background', 'positioned-text'].includes(block.type));
      const fit = flowing.length === 1 && flowing[0].type === 'fit';
      if (fit) blocks = blocks.flatMap(block => block === flowing[0] ? block.blocks : [block]);
      const headingIndex = blocks.findIndex(block => block.type === 'text' && block.heading === 1);
      const titleBlock = headingIndex >= 0 ? blocks.splice(headingIndex, 1)[0] : null;
      const title = titleBlock?.runs || [];
      if (/<\/?(?:table|div|style|script|iframe)\b/i.test(raw.join('\n'))) slideWarnings.push('HTML is shown as text. Use Markdown tables and ::: blocks.');
      const nestedHeading = blocks.flatMap(block => block.type === 'center' ? block.blocks : []).find(block => block.heading === 1);
      const positionedTitle = blocks.find(block => block.type === 'positioned-text');
      slides.push({ fit, markerLine: current.markerLine, startLine: current.startLine, endLine, title, titleSource: titleBlock && { sourceStart: titleBlock.sourceStart, sourceEnd: titleBlock.sourceEnd }, outlineTitle: title.length ? title : nestedHeading?.runs || positionedTitle?.runs || [], blocks, notes: current.noteLines.join('\n').trim(), noteSource: current.noteSources.length ? { sourceStart: current.noteSources[0], sourceEnd: current.noteSources.at(-1) + 1 } : null, warnings: slideWarnings });
    }
    for (let index = prefixLines; index < lines.length; index++) {
      const line = lines[index], code = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!notes && code) { if (!fence) fence = code[1]; else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = null; current.raw.push(line); current.rawSources.push(index); continue; }
      if (!fence && !notes && /^:::notes\s*$/.test(line)) { notes = true; continue; }
      if (notes) { if (/^:::\s*$/.test(line)) notes = false; else { current.noteLines.push(line); current.noteSources.push(index); } continue; }
      if (!fence && /^ {0,3}---[ \t]*$/.test(line)) {
        finish(index);
        current = { markerLine: index, startLine: index + 1, raw: [], rawSources: [], noteLines: [], noteSources: [] }; continue;
      }
      current.raw.push(line); current.rawSources.push(index);
    }
    finish(lines.length);
    if (notes) warnings.push('Presenter notes are missing their closing ::: marker.');
    if (!slides.length) slides.push({ markerLine: -1, startLine: prefixLines, endLine: lines.length, title: [], outlineTitle: [], blocks: [], notes: '', warnings: [] });
    return { enabled: true, settings: { theme, aspect, footerImage: meta.values['footer-image'] || '', footerLeft: meta.values['footer-left'] || '', footerCenter: meta.values['footer-center'] || '', footerRight: meta.values['footer-right'] || '', footerPageNumbers: meta.values['footer-page-numbers'] !== 'false' }, slides, warnings };
  }
  function lineCount(text, width, fontSize) {
    // Conservative shared estimate; the browser also checks actual text overflow.
    const capacity = Math.max(5, width * 72 / (fontSize * 0.53));
    return String(text).split('\n').reduce((total, line) => {
      let length = 0, count = 1;
      for (const word of line.split(/\s+/)) { if (length && length + word.length + 1 > capacity) { count++; length = 0; } const needed = Math.max(1, Math.ceil(word.length / capacity)); count += needed - 1; length += word.length % capacity + 1; }
      return total + count;
    }, 0);
  }
  function layoutScene(deck, index, scale = 1, imageDimensions = new Map()) {
    const slide = deck.slides[index], theme = themes[deck.settings.theme];
    const width = deck.settings.aspect === '4:3' ? 10 : 40 / 3, height = 7.5;
    const elements = [], lists = [], warnings = [...slide.warnings], margin = .62, bottom = 6.96;
    const textHeight = (runs, w, size) => Math.max(.25, lineCount(plain(runs), w, size) * size / 72 * 1.2 + .035);
    const addText = (runs, x, y, w, size, props = {}) => {
      const h = textHeight(runs, w, size); elements.push({ type: 'text', runs, x, y, w, h, fontSize: size, color: theme.ink, ...props }); return h;
    };
    const fontSize = block => (block.code ? 18 : block.heading === 1 ? 40 : block.heading ? 27 : 23) * scale;
    function mediaBox(block, parentWidth, available = 2.7) {
      const dimensions = imageDimensions.get(block.src), ratio = block.qrSvg ? 1 : dimensions ? dimensions.width / dimensions.height : 1.5;
      const requestedWidth = lengthInches(block.mediaWidth, parentWidth), requestedHeight = lengthInches(block.mediaHeight, parentWidth);
      if (!block.qrSvg && requestedHeight === null) {
        // Width is a maximum: preserve the image's aspect ratio and reserve room
        // for the text that follows, rather than pushing it off the slide.
        const maxWidth=Math.min(parentWidth,Math.max(.2,available-.2)*ratio);
        const w=Math.min(maxWidth,requestedWidth || parentWidth);
        return {w,h:w/ratio,maxWidth};
      }
      const w = Math.min(parentWidth, requestedWidth || (requestedHeight ? requestedHeight * ratio : 1.5));
      return { w, h: requestedHeight || w / ratio };
    }
    const specialBlocks = [];
    function collect(blocks) {
      for (const block of blocks) {
        if (['background', 'positioned-text'].includes(block.type)) specialBlocks.push(block);
        if (block.blocks) collect(block.blocks);
        if (block.columns) block.columns.forEach(collect);
      }
    }
    collect(slide.blocks);
    const backgrounds = specialBlocks.filter(block => block.type === 'background');
    if (backgrounds.length > 1) warnings.push('Use one background per slide; the first background is used.');
    const background = backgrounds[0];
    if (background) {
      elements.push({ ...background, type: 'image', background: true, position: background.position, anchor: anchors[background.position], x: 0, y: 0, w: width, h: height });
      if (background.overlay !== 'none' && background.opacity > 0) elements.push({ type: 'shape', x: 0, y: 0, w: width, h: height, color: background.overlay === 'dark' ? '000000' : 'FFFFFF', opacity: background.opacity });
    }
    const columnSizes = (block, w) => { const gap = .4, total = block.widths.reduce((a, b) => a + b, 0); return block.widths.map(value => Math.max(.15, w - gap * (block.columns.length - 1)) * value / total); };
    function estimate(blocks, w) {
      return blocks.reduce((total, block) => {
        if (['background', 'positioned-text'].includes(block.type)) return total;
        if (block.type === 'image') return total + mediaBox(block, w).h + .2;
        if (block.type === 'video') return total + Math.min(w, lengthInches(block.mediaWidth,w) || w) * 9 / 16 + .45;
        if (block.type === 'center' || block.type === 'fit') return total + estimate(block.blocks, w);
        if (block.type === 'columns') { const sizes = columnSizes(block, w); return total + Math.max(...block.columns.map((col, i) => estimate(col, sizes[i]))) + .2; }
        if (block.type === 'table') return total + block.rows.reduce((sum, row) => sum + Math.max(...row.map(cell => textHeight([{ text: cell }], w / Math.max(1, row.length) - .16, 19 * scale))) + .18, 0) + .22;
        return total + textHeight(block.runs, Math.max(.2, w - (block.bullet ? .4 : 0)), fontSize(block)) + .16;
      }, 0);
    }
    function stack(blocks, x, y, w, limit = bottom, align = 'left') {
      let list = null;
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i], available = Math.max(.4, limit - y - estimate(blocks.slice(i + 1), w));
        if (!block.bullet) list = null;
        if (['background', 'positioned-text'].includes(block.type)) continue;
        if (block.type === 'columns') {
          const sizes = columnSizes(block, w), gap = i < blocks.length - 1 ? .2 : 0; let left = x;
          const top=y,cards=[];
          if(block.cards){let cardLeft=x;for(const size of sizes){const card={type:'shape',x:cardLeft-.08,y:top-.08,w:size+.16,h:.16,color:theme.background,opacity:100,stroke:theme.muted,sourceStart:block.sourceStart,sourceEnd:block.sourceEnd};cards.push(card);elements.push(card);cardLeft+=size+.4;}}
          y = Math.max(y, ...block.columns.map((col, n) => { const end = stack(col, left, y, sizes[n], y + Math.max(.4, available - gap), align); left += sizes[n] + .4; return end; })) + gap;
          for(const card of cards)card.h=Math.max(.3,y-gap-top+.16);
        } else if (block.type === 'center' || block.type === 'fit') y = stack(block.blocks, x, y, w, y + available, block.type === 'center' ? 'center' : align);
        else if (block.type === 'video') { const boxWidth=Math.min(w,lengthInches(block.mediaWidth,w)||w,Math.max(2,(available-.25)*16/9)); const h=boxWidth*9/16+.25; elements.push({...block,x,y,w:boxWidth,h});y+=h+.2; }
        else if (block.type === 'image') { const box = mediaBox(block, w, available); elements.push({ ...block, x: block.mediaAlign === 'right' ? x + w - box.w : x, y, maxWidth:w, ...box }); y += box.h + .2; }
        else if (block.type === 'table') { const h = estimate([block], w) - .22; elements.push({ ...block, x, y, w, h, fontSize: 19 * scale }); y += h + .22; }
        else {
          const size = fontSize(block), markerWidth = block.bullet ? Math.max(.28, block.bullet.length * .17) : 0;
          const indent = block.bullet ? markerWidth + .09 + (block.depth || 0) * .22 : 0;
          if (block.bullet && (!list || list.sourceId !== block.listId)) {
            list = { x, y, w, h: 0, items: [], sourceId: block.listId, id: lists.length }; lists.push(list);
          }
          const props = { bold: !!block.heading, code: !!block.code, align, ...(block.bullet ? { listId: list.id } : {}) };
          props.sourceStart = block.sourceStart; props.sourceEnd = block.sourceEnd;
          if (block.bullet) addText([{ text: block.bullet }], x + (block.depth || 0) * .22, y, markerWidth, size, { listId: list.id, sourceStart: block.sourceStart, sourceEnd: block.sourceEnd });
          const h = addText(block.runs, x + indent, y, Math.max(.2, w - indent), size, props);
          if (block.bullet) { list.items.push({ ...block, ...props, y, h, indent, fontSize: size }); list.h = y + h - list.y; }
          y += h + .16;
        }
      }
      if (y > bottom + .02) warnings.push('Content extends beyond the slide. Shorten it or add another slide.');
      return y;
    }
    let top = margin;
    if (slide.title.length) top += addText(slide.title, margin, top, width - margin * 2, 34 * scale, { bold: true, color: theme.accent, ...slide.titleSource }) + .3;
    stack(slide.blocks, margin, top, width - margin * 2);
    for (const block of specialBlocks.filter(block => block.type === 'positioned-text')) {
      const x = block.x / 100 * width, y = block.y / 100 * height, w = block.width / 100 * width;
      const h = addText(block.runs, x, y, w, block.size * scale, { ...block, type: 'text', x, y, w, h: textHeight(block.runs, w, block.size * scale), positioned: true, color: block.color, fontSize: block.size * scale });
      if (x + w > width + .01 || y + h > height + .01) warnings.push('Content extends beyond the slide. Move or resize the positioned text, reduce its size, or use :::fit.');
    }
    if (!background) {
      const footer = deck.settings;
      const hasCustom = footer.footerImage || footer.footerLeft || footer.footerCenter || footer.footerRight;
      if (hasCustom) {
        const y = 7.12, fontSize = 10.5;
        if (footer.footerImage) {
          const dimensions = imageDimensions.get(footer.footerImage), ratio = dimensions ? dimensions.width / dimensions.height : 1.5;
          const h = .22, w = Math.min(.95, h * ratio);
          elements.push({ type: 'image', src: footer.footerImage, alt: 'Footer logo', x: margin, y: y - .02, w, h, footer: true });
        }
        const leftX = margin + (footer.footerImage ? 1.05 : 0);
        if (footer.footerLeft) elements.push({ type: 'text', runs: [{ text: footer.footerLeft }], x: leftX, y, w: width / 3 - leftX + .4, h: .24, fontSize, color: theme.muted, footer: true });
        if (footer.footerCenter) elements.push({ type: 'text', runs: [{ text: footer.footerCenter }], x: width / 3, y, w: width / 3, h: .24, align: 'center', fontSize, color: theme.muted, footer: true });
        const right = footer.footerRight || (footer.footerPageNumbers ? String(index + 1) : '');
        if (right) elements.push({ type: 'text', runs: [{ text: right.replace(/\{page\}/g, String(index + 1)).replace(/\{total\}/g, String(deck.slides.length)) }], x: width * 2 / 3, y, w: width / 3 - margin, h: .24, align: 'right', fontSize, color: theme.muted, footer: true });
      } else if (footer.footerPageNumbers) {
        elements.push({ type: 'text', runs: [{ text: String(index + 1) }], x: width - 1, y: 7.12, w: .4, h: .2, fontSize: 11, color: theme.muted, footer: true });
      }
    }
    return { width, height, theme, elements, lists, textScale: scale, warnings: [...new Set(warnings)], overflow: warnings.some(warning => warning.startsWith('Content extends beyond')) };
  }
  function scene(deck, index, imageDimensions) {
    let result = layoutScene(deck, index, 1, imageDimensions);
    if (deck.slides[index].fit) {
      for (let percent = 95; result.overflow && percent >= 65; percent -= 5) result = layoutScene(deck, index, percent / 100, imageDimensions);
      if (result.overflow) result.warnings.push('Text has reached the minimum fit size. Use columns, shorten it, or add another slide.');
    }
    return result;
  }
  // Move complete source chunks, using parser boundaries so separators inside
  // fenced code and teacher notes stay attached to their slide.
  function reorderEdit(text, from, to) {
    const deck=parse(text),count=deck.slides.length;
    if(!deck.enabled || !Number.isInteger(from) || !Number.isInteger(to) || from<0 || to<0 || from>=count || to>=count || from===to || deck.warnings.some(warning=>warning.includes('missing their closing')))return null;
    const rows=text.split('\n'),offset=line=>Math.min(text.length,rows.slice(0,line).reduce((sum,row)=>sum+row.length+1,0));
    const start=offset(deck.slides[0].startLine),eol=text.includes('\r\n')?'\r\n':'\n';
    const chunks=deck.slides.map(slide=>text.slice(offset(slide.startLine),offset(slide.endLine)));
    const [moved]=chunks.splice(from,1);chunks.splice(to,0,moved);
    let body=chunks.map((chunk,index)=>index<chunks.length-1 && !chunk.endsWith('\n')?chunk+eol:chunk).join('---'+eol);
    // An initial empty slide needs its own opening separator; otherwise the
    // parser treats its whitespace as the gap after document metadata.
    if(parse(text.slice(0,start)+body).slides.length<count)body='---'+eol+body;
    return {start,end:text.length,text:body,index:to};
  }
  // An explicit source edit, never an invisible layout change. Only uncomplicated
  // one-image slides qualify; manual columns, backgrounds and overlays stay intact.
  function imageTextEdit(text, index, imageDimensions = new Map()) {
    const deck=parse(text), slide=deck.slides[index];
    if(!deck.enabled || !slide || slide.warnings.length || !slide.blocks.every(block=>['text','image'].includes(block.type)))return null;
    const images=slide.blocks.filter(block=>block.type==='image');
    if(images.length!==1 || images[0].qrSvg || !slide.blocks.some(block=>block.type==='text'))return null;
    const image=images[0], lines=text.split(/\r?\n/), picture=lines.slice(image.sourceStart,image.sourceEnd).join('\n').trim();
    if(image.sourceEnd!==image.sourceStart+1 || !/^!\[[^\]]*\]\([^\n]+\)(?:\{[^}]*\})?$/.test(picture))return null;
    const title=slide.titleSource?lines.slice(slide.titleSource.sourceStart,slide.titleSource.sourceEnd).join('\n'):'';
    const content=[],notes=[];let inNotes=false, fence=null;
    for(let line=slide.startLine;line<slide.endLine;line++){
      const value=lines[line];
      if(inNotes){notes.push(value);if(/^:::\s*$/.test(value))inNotes=false;continue;}
      const code=value.match(/^ {0,3}(`{3,}|~{3,})/);
      if(code){if(!fence)fence=code[1];else if(code[1][0]===fence[0]&&code[1].length>=fence.length)fence=null;}
      if(!fence && !code && /^:::notes\s*$/.test(value)){inNotes=true;notes.push(value);continue;}
      if(line===image.sourceStart || (slide.titleSource && line>=slide.titleSource.sourceStart && line<slide.titleSource.sourceEnd))continue;
      content.push(value);
    }
    if(inNotes)return null;
    let body=content.join('\n').trim();
    if(slide.fit)body=body.replace(/^:::fit\s*\n/,'').replace(/\n:::\s*$/,'').trim();
    if(!body)return null;
    const offset=line=>Math.min(text.length,lines.slice(0,line).reduce((sum,value)=>sum+value.length+(text.includes('\r\n')?2:1),0));
    const start=offset(slide.startLine),end=offset(slide.endLine),eol=text.includes('\r\n')?'\r\n':'\n';
    const dimensions=imageDimensions.get(image.src),ratio=dimensions?dimensions.width/dimensions.height:1.5;
    const length=plain(slide.blocks.filter(block=>block.type==='text').flatMap(block=>block.runs)).length;
    const preferred=length>420?'2/3,1/3':length>220 || ratio<.85?'3/5,2/5':length<100 && ratio>1.8?'2/5,3/5':'1/2,1/2';
    const widths=[preferred,...['1/2,1/2','3/5,2/5','2/3,1/3','2/5,3/5'].filter(value=>value!==preferred)];
    let best=null;
    for(const [rank,width] of widths.entries()){
      let value=(title?title+'\n\n':'')+':::columns widths='+width+'\n:::column\n'+body+'\n\n:::column\n'+picture+'\n:::';
      if(slide.fit)value=':::fit\n'+value+'\n:::';
      value+=(notes.length?'\n\n'+notes.join('\n'):'')+'\n\n';
      value=value.replace(/\n/g,eol);
      const proposed=parse(text.slice(0,start)+value+text.slice(end)),layout=scene(proposed,index,imageDimensions);
      const overflow=Math.max(0,...layout.elements.filter(element=>!element.footer).map(element=>element.y+element.h-6.96));
      const score=overflow*1000+(layout.overflow?100:0)+rank;
      if(!best || score<best.score)best={start,end,text:value,score};
    }
    return best && {start:best.start,end:best.end,text:best.text};
  }
  // Return a source edit for one slide, preserving other slides and private notes.
  function overflowEdit(text, index, action) {
    if(action==='columns'){const smart=imageTextEdit(text,index);if(smart)return smart;}
    const deck = parse(text), slide = deck.slides[index];
    if (!deck.enabled || !slide || !['fit', 'columns'].includes(action)) return null;
    const positioned = blocks => blocks.some(block => ['background', 'positioned-text'].includes(block.type) || (block.blocks && positioned(block.blocks)) || (block.columns && block.columns.some(positioned)));
    if (action === 'columns' && positioned(slide.blocks)) return null;
    const lines = text.split('\n'), offset = line => lines.slice(0, line).reduce((sum, value) => sum + value.length + 1, 0);
    const start = Math.min(text.length, offset(slide.startLine)), end = Math.min(text.length, offset(slide.endLine));
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const content = [], notes = []; let fence = null, inNotes = false;
    for (const line of text.slice(start, end).split(/\r?\n/)) {
      if (inNotes) { notes.push(line); if (/^:::\s*$/.test(line)) inNotes = false; continue; }
      const code = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (code) { if (!fence) fence = code[1]; else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = null; }
      if (!fence && /^:::notes\s*$/.test(line)) { inNotes = true; notes.push(line); } else content.push(line);
    }
    // Do not rewrite an incomplete notes block or a malformed content block.
    if (inNotes || slide.warnings.length) return null;
    let body = content.join('\n').trim();
    if (slide.fit) body = body.replace(/^:::fit\s*\n/, '').replace(/\n:::\s*$/, '').trim();
    if (action === 'fit') {
      if (slide.fit) return null;
    } else {
      const containsColumns = blocks => blocks.some(block => block.type === 'columns' || (block.blocks && containsColumns(block.blocks)));
      if (containsColumns(slide.blocks)) return null;
      // Only split at top-level Markdown blocks or direct list items. Keep fenced
      // code, tables, nested lists and ::: groups intact.
      function boundaries(value) {
        const rows = value.split('\n'), safe = []; let depth = 0, codeFence = null;
        for (const [n, row] of rows.entries()) {
          safe[n] = depth === 0 && !codeFence && !/^:::\s*$/.test(row);
          const code = row.match(/^ {0,3}(`{3,}|~{3,})/);
          if (code) { if (!codeFence) codeFence = code[1]; else if (code[1][0] === codeFence[0] && code[1].length >= codeFence.length) codeFence = null; }
          if (!codeFence && !code) { if (/^:::\s*$/.test(row)) depth--; else if (/^:::\w/.test(row)) depth++; }
        }
        const tokens = markdown.parse(value, {});
        return { rows, safe, tokens, at: line => rows.slice(0, line).reduce((sum, row) => sum + row.length + 1, 0) };
      }
      let data = boundaries(body), title = '';
      const heading = data.tokens.find(token => token.type === 'heading_open' && token.tag === 'h1' && token.level === 0 && data.safe[token.map[0]]);
      if (heading) {
        title = data.rows.slice(...heading.map).join('\n');
        body = [...data.rows.slice(0, heading.map[0]), ...data.rows.slice(heading.map[1])].join('\n').trim();
      }
      data = boundaries(body);
      const candidates = [...new Set(data.tokens.filter(token => token.map && data.safe[token.map[0]] &&
        ((token.level === 0 && /^(heading_open|paragraph_open|fence|code_block|table_open|bullet_list_open|ordered_list_open)$/.test(token.type)) || (token.type === 'list_item_open' && token.level === 1)))
        .map(token => data.at(token.map[0])))].filter(position => body.slice(0, position).trim() && body.slice(position).trim() &&
          !data.tokens.some(token => token.type === 'heading_open' && data.at(token.map[1]) <= position && !body.slice(data.at(token.map[1]), position).trim()));
      if (!candidates.length) return null;
      const split = candidates.sort((a, b) => Math.abs(a - body.length / 2) - Math.abs(b - body.length / 2))[0];
      body = (title ? title + '\n\n' : '') + ':::columns\n:::column\n' + body.slice(0, split).trim() + '\n\n:::column\n' + body.slice(split).trim() + '\n:::';
    }
    if (slide.fit || action === 'fit') body = ':::fit\n' + body + '\n:::';
    return { start, end, text: (body + (notes.length ? '\n\n' + notes.join('\n') : '') + '\n\n').replace(/\n/g, eol) };
  }
  function positionEdit(text, sourceLine, values) {
    const lines = text.split('\n'), line = lines[sourceLine];
    if (!line || !/^:::text(?:\s|$)/.test(line)) return null;
    let replacement = line;
    for (const [key, value] of Object.entries(values)) {
      if (!['x', 'y', 'width', 'size', 'color', 'align', 'font'].includes(key)) return null;
      const percent = ['x', 'y', 'width'].includes(key);
      if (percent && (!Number.isFinite(value) || value < (key === 'width' ? 1 : 0) || value > 100)) return null;
      if (key === 'size' && (!Number.isFinite(value) || value < 8 || value > 144)) return null;
      if (!percent && key !== 'size') { const warnings = []; blockOptions('text', `${key}=${value}`, warnings); if (warnings.length) return null; }
      const attribute = `${key}=${percent ? Math.round(value * 10) / 10 + '%' : value}`, pattern = new RegExp(`(^|\\s)${key}=\\S+`);
      replacement = pattern.test(replacement) ? replacement.replace(pattern, (_, space) => space + attribute) : replacement.trimEnd() + ' ' + attribute;
    }
    const start = lines.slice(0, sourceLine).reduce((sum, line) => sum + line.length + 1, 0);
    return { start, end: start + line.length, text: replacement };
  }
  function mediaEdit(text, element, width) {
    if (!Number.isFinite(width) || width < .1 || width > 40 || element.background) return null;
    const lines = text.split('\n'), start = lines.slice(0, element.sourceStart).reduce((sum, line) => sum + line.length + 1, 0);
    const end = Math.min(text.length, start + lines.slice(element.sourceStart, element.sourceEnd).join('\n').length);
    let occurrence = 0;
    const pattern = element.qrSvg ? /(\[qr:[^\]]*\])(?:\{([^}]*)\})?/gi : /(!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\))(?:\{([^}]*)\})?/g;
    const replacement = text.slice(start, end).replace(pattern, (match, media, attributes = '') => {
      if (occurrence++ !== (element.mediaOccurrence || 0)) return match;
      const retained = attributes.split(/\s+/).filter(value => value && !/^(width|height)=/i.test(value));
      return media + '{' + [...retained, `width=${Math.round(width * 100) / 100}in`].join(' ') + '}';
    });
    return replacement === text.slice(start, end) ? null : { start, end, text: replacement };
  }
  function movableTextEdit(text, element, scene) {
    if (element.type !== 'text' || element.footer || element.positioned || !Number.isInteger(element.sourceStart)) return null;
    if(element.listId !== undefined){const list=scene.lists[element.listId];element={...element,...list,sourceStart:Math.min(...list.items.map(item=>item.sourceStart)),sourceEnd:Math.max(...list.items.map(item=>item.sourceEnd)),fontSize:list.items[0].fontSize};}
    const lines = text.split('\n'), start = lines.slice(0, element.sourceStart).reduce((sum, line) => sum + line.length + 1, 0), end = Math.min(text.length, start + lines.slice(element.sourceStart, element.sourceEnd).join('\n').length);
    const percent = value => Math.round(value * 1000) / 10;
    return { start, end, text: `:::text x=${percent(element.x / scene.width)}% y=${percent(element.y / scene.height)}% width=${percent(element.w / scene.width)}% size=${Math.max(8, Math.min(144, Math.round(element.fontSize / scene.textScale)))} color=#${element.color}\n${text.slice(start, end)}\n:::` };
  }
  function backgroundEdit(text, element, values) {
    const lines = text.split('\n'), line = lines[element.blockStart];
    if (!element.background || !line || !/^:::background(?:\s|$)/.test(line)) return null;
    const start = lines.slice(0, element.blockStart).reduce((sum, line) => sum + line.length + 1, 0);
    const end = Math.min(text.length, lines.slice(0, element.blockEnd).reduce((sum, line) => sum + line.length + 1, 0));
    if (values.remove === true) return { start, end, text: '' };
    let replacement = text.slice(start, end), opening = line;
    for (const [key, value] of Object.entries(values)) {
      if (key === 'imagePath') {
        if (typeof value !== 'string' || !value.trim() || /[\r\n\0]|^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(value.trim())) return null;
        const path = value.trim().replace(/[\s()]/g, character => encodeURIComponent(character));
        replacement = replacement.replace(/(!\[[^\]]*\]\()[^)\s]+/, (_, prefix) => prefix + path); continue;
      }
      if (!['position', 'overlay', 'opacity'].includes(key)) return null;
      const warnings = []; blockOptions('background', `${key}=${value}`, warnings); if (warnings.length) return null;
      const pattern = new RegExp(`(^|\\s)${key}=\\S+`), attribute = `${key}=${value}`;
      opening = pattern.test(opening) ? opening.replace(pattern, (_, space) => space + attribute) : opening.trimEnd() + ' ' + attribute;
    }
    return { start, end, text: opening + replacement.slice(line.length) };
  }
  function setting(text, key, value) {
    const meta = metadata(text); if (!meta.enabled || !['theme', 'aspect'].includes(key)) return text;
    const lines = meta.prefix.split(/\r?\n/); const index = lines.findIndex(line => new RegExp(`^${key}\\s*:`).test(line));
    if (index >= 0) lines[index] = `${key}: ${value}`; else lines.splice(lines.map(line => line.trim()).lastIndexOf('---'), 0, `${key}: ${value}`);
    return lines.join('\n') + text.slice(meta.prefix.length);
  }
  const starter = '---\ntype: slides\ntheme: classroom\naspect: 16:9\n---\n\n# New lesson\n\nA short introduction to today’s learning.\n\n---\n\n# Investigate\n\n- Observe the example.\n- Test one idea.\n- Record your evidence.\n\n:::notes\nMaterials and teacher reminders go here.\n:::\n\n---\n\n# Reflect\n\nWhat changed your thinking today?\n';
  return { metadata, parse, scene, reorderEdit, imageTextEdit, overflowEdit, positionEdit, mediaEdit, movableTextEdit, backgroundEdit, setting, themes, starter, plain, blocksFromMarkdown };
});
