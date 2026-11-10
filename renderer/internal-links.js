(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./vendor/markdown-it.min.js') : root.markdownit);
  if (typeof module === 'object') module.exports = api; else root.HandoutLinks = api;
})(typeof window === 'object' ? window : globalThis, function (MarkdownIt) {
  'use strict';
  const markdown = new MarkdownIt({ html: true });
  const slug = title => String(title).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-') || 'section';
  function targets(text, deck = null) {
    // Keep source line numbers while excluding YAML, notes, comments and code.
    const lines = String(text).split(/\r?\n/), meta = String(text).match(/^\uFEFF?---[^\S\n]*\r?\n[\s\S]*?\r?\n---[^\S\n]*(?:\r?\n|$)/);
    const prefix = meta ? meta[0].split('\n').length - (meta[0].endsWith('\n') ? 1 : 0) : 0;
    let notes = false, fence = null;
    const separators = new Set(deck?.enabled ? deck.slides.map(slide => slide.markerLine) : []);
    const visible = lines.map((line, index) => {
      if (index < prefix) return '';
      if (separators.has(index)) return '';
      const code = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (!notes && code) { if (!fence) fence = code[1]; else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = null; return line; }
      if (fence) return line;
      if (!notes && /^:::notes\s*$/.test(line)) { notes = true; return ''; }
      if (notes) { if (/^:::\s*$/.test(line)) notes = false; return ''; }
      return line;
    }).join('\n');
    const tokens = markdown.parse(visible, {}), result = [], used = new Set();
    // Numeric slide fragments are aliases, including slides with no heading.
    if (deck?.enabled) deck.slides.forEach((_, index) => used.add(`slide-${index + 1}`));
    function unique(title) { const base = slug(title); let id = base, suffix = 2; while (used.has(id)) id = `${base}-${suffix++}`; used.add(id); return id; }
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]; if (token.type !== 'heading_open') continue;
      const title = (tokens[i + 1]?.children || []).map(child => ['text', 'code_inline', 'image'].includes(child.type) ? child.content : /break$/.test(child.type) ? ' ' : '').join('');
      const sourceStart = token.map[0];
      const slideIndex = deck?.enabled ? deck.slides.findIndex(slide => sourceStart >= slide.startLine && sourceStart < slide.endLine) : undefined;
      if (slideIndex === -1) continue;
      result.push({ id: unique(title), title: title || 'Untitled heading', sourceStart, level: Number(token.tag.slice(1)), ...(slideIndex !== undefined ? { slideIndex } : {}) });
    }
    if (deck?.enabled) for (const [slideIndex, slide] of deck.slides.entries()) {
      if (!result.some(target => target.slideIndex === slideIndex)) {
        const title = (slide.outlineTitle || []).map(run => run.text).join('') || `Slide ${slideIndex + 1}`;
        result.push({ id: `slide-${slideIndex + 1}`, title, sourceStart: slide.startLine, level: 1, slideIndex });
      }
    }
    return result.sort((a, b) => a.sourceStart - b.sourceStart);
  }
  function resolve(href, list) {
    if (typeof href !== 'string' || !href.startsWith('#')) return null;
    let id; try { id = decodeURIComponent(href.slice(1)); } catch { return null; }
    return list.find(target => target.id === id) || (/^slide-[1-9]\d*$/.test(id) ? list.find(target => target.slideIndex === Number(id.slice(6)) - 1) : null) || null;
  }
  function markup(label, id) { return `[${String(label).replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]+/g, ' ')}](#${encodeURIComponent(id)})`; }

  function mount({ source, preview, previewPanel, slideStudio, edit, refresh, status }) {
    const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'document-settings-trigger'; trigger.textContent = 'Link…'; trigger.setAttribute('aria-label', 'Insert internal link'); trigger.title = 'Link to a heading or slide in this document';
    document.querySelector('#document-settings-button').before(trigger);
    const currentDeck = () => window.HandoutSlides.metadata(source.value).enabled ? window.HandoutSlides.parse(source.value) : null;
    const list = () => targets(source.value, currentDeck());
    function assignAnchors() {
      const destinations = list();
      for (const heading of preview.querySelectorAll('h1[data-source-start],h2[data-source-start],h3[data-source-start],h4[data-source-start],h5[data-source-start],h6[data-source-start]')) {
        const target = destinations.find(target => target.sourceStart === Number(heading.dataset.sourceStart));
        if (target) heading.id = target.id;
      }
    }
    trigger.onclick = () => {
      if (source.disabled) return;
      const destinations = list(), start = source.selectionStart, end = source.selectionEnd, original = source.value;
      if (!destinations.length) { status.textContent = 'Add a heading before linking within this document.'; return; }
      const overlay = document.createElement('div'); overlay.className = 'app-dialog-overlay';
      const form = document.createElement('form'); form.className = 'image-rename-dialog internal-link-dialog'; form.setAttribute('role', 'dialog'); form.setAttribute('aria-modal', 'true'); form.setAttribute('aria-label', 'Insert internal link');
      form.innerHTML = '<header><strong>Link within this document</strong></header><label>Destination<select aria-label="Link destination"></select></label><label>Link text<input aria-label="Link text" required></label><p>Click internal links to jump in preview or presentation. Renaming a heading changes its link address.</p><footer><button type="button" class="button secondary">Cancel</button><button type="submit" class="button primary">Insert link</button></footer>';
      const select = form.querySelector('select'), input = form.querySelector('input');
      for (const target of destinations) { const option = document.createElement('option'); option.value = target.id; option.textContent = `${target.slideIndex !== undefined ? `Slide ${target.slideIndex + 1}: ` : ''}${target.title}`; select.append(option); }
      const selectedText = original.slice(start, end); input.value = selectedText || destinations[0].title;
      select.onchange = () => { if (!selectedText) input.value = destinations.find(target => target.id === select.value).title; };
      const close = () => { overlay.remove(); window.removeEventListener('keydown', escape); source.focus({ preventScroll: true }); };
      const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
      form.querySelector('button[type="button"]').onclick = close;
      form.onsubmit = event => { event.preventDefault(); if (source.value !== original) { close(); status.textContent = 'The document changed. Choose the link destination again.'; return; } const text = markup(input.value, select.value); close(); source.setSelectionRange(start, end); edit(text, 0); refresh(); };
      overlay.append(form); document.body.append(overlay); window.addEventListener('keydown', escape); select.focus();
    };
    preview.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]'); if (!link) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const href = link.getAttribute('href'), target = resolve(href, list());
      if (!target) { status.textContent = `Internal link target not found: ${href}`; return; }
      if (currentDeck()) { slideStudio.jump(target.slideIndex); return; }
      const node = [...preview.querySelectorAll('[id]')].find(node => node.id === target.id);
      if (node) { previewPanel.scrollTop += node.getBoundingClientRect().top - previewPanel.getBoundingClientRect().top - document.querySelector('.preview-heading').offsetHeight - 8; node.tabIndex = -1; node.focus({ preventScroll: true }); }
    }, true);
    return { assignAnchors };
  }
  return { slug, targets, resolve, markup, mount };
});
