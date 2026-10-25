/* Optional document and lesson metadata, edited through the Markdown source. */
(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('yaml') : root.HandoutYaml);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HandoutDocumentSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (YAML) {
  'use strict';
  const suggestions = [
    ['title', 'Title', 'text', 'A name for the lesson or activity.'],
    ['audience', 'Audience', 'text', 'Grade level, class, or intended learners.'],
    ['assignment', 'Assignment', 'text', 'What students will do or produce.'],
    ['learning-goals', 'Learning goals', 'list', 'What students should learn. Enter one goal per line.'],
    ['success-criteria', 'Success criteria', 'list', 'What successful work demonstrates. Enter one criterion per line.'],
    ['prior-knowledge', 'Prior knowledge', 'list', 'What students should already know. Enter one item per line.'],
    ['duration-minutes', 'Duration (minutes)', 'number', 'Approximate time for the activity.'],
    ['scaffolding', 'Scaffolding', 'list', 'Supports such as a word bank or worked example. Enter one item per line.']
  ].map(([key, label, type, description]) => ({ key, label, type, description }));
  const types = [['text', 'Text'], ['list', 'List (one item per line)'], ['number', 'Number'], ['boolean', 'Yes / no'], ['yaml', 'YAML (nested values)']];
  function split(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const opening = text.match(/^\uFEFF?---[ \t]*\r?\n/);
    if (!opening) return { start: text.startsWith('\uFEFF') ? 1 : 0, end: text.startsWith('\uFEFF') ? 1 : 0, yaml: '', opening: '', closing: '', eol };
    const closing = /^---[ \t]*(?:\r?\n|$)/m.exec(text.slice(opening[0].length));
    if (!closing) throw Error('The frontmatter is missing its closing --- line. Choose Show YAML to fix it.');
    const end = opening[0].length + closing.index;
    return { start: 0, end: end + closing[0].length, yaml: text.slice(opening[0].length, end), opening: opening[0], closing: closing[0], eol };
  }
  function read(text) {
    const frontmatter = split(text);
    const document = YAML.parseDocument(frontmatter.yaml, { uniqueKeys: true });
    if (document.errors.length) throw Error(document.errors[0].message);
    if (document.contents !== null && !YAML.isMap(document.contents)) throw Error('Frontmatter must contain named properties. Choose Show YAML to edit it.');
    const lesson = document.get('lesson-info', true);
    if (lesson && !(YAML.isScalar(lesson) && lesson.value === null) && !YAML.isMap(lesson)) throw Error('lesson-info must contain nested properties. Choose Show YAML to edit it.');
    return { frontmatter, document, lesson: YAML.isMap(lesson) ? lesson : null };
  }
  function same(node, value) {
    if (YAML.isScalar(node)) return node.value === value;
    return YAML.isSeq(node) && Array.isArray(value) && node.items.length === value.length && node.items.every((item, index) => YAML.isScalar(item) && item.value === value[index]);
  }
  function update(text, { document: documentEntries = [], lesson: lessonEntries = [] } = {}) {
    const state = read(text), doc = state.document;
    let changed = false;
    function set(path, value) {
      const previous = doc.getIn(path, true);
      if (value === undefined) { if (doc.hasIn(path)) { doc.deleteIn(path); changed = true; } return; }
      if (same(previous, value)) return;
      if (doc.contents === null) doc.contents = doc.createNode({});
      // Preserve comments and anchors when replacing a list or changing its type.
      if (previous && !(YAML.isScalar(previous) && !YAML.isNode(value) && !Array.isArray(value))) {
        const node = YAML.isNode(value) ? value : doc.createNode(value);
        for (const key of ['comment', 'commentBefore', 'spaceBefore', 'anchor']) if (previous[key] !== undefined) node[key] = previous[key];
        value = node;
      }
      doc.setIn(path, value); changed = true;
    }
    for (const [key, value] of documentEntries) set([key], value);
    for (const [key, value] of lessonEntries) {
      if (value !== undefined && !YAML.isMap(doc.get('lesson-info', true))) set(['lesson-info'], doc.createNode({}));
      set(['lesson-info', key], value);
    }
    const lesson = doc.get('lesson-info', true);
    if (lessonEntries.length && YAML.isMap(lesson) && !lesson.items.length) doc.delete('lesson-info');
    if (!changed) return null;
    const part = state.frontmatter;
    const empty = YAML.isMap(doc.contents) && !doc.contents.items.length && !doc.commentBefore && !doc.comment && !doc.contents.commentBefore && !doc.contents.comment;
    let replacement = '';
    if (!empty) {
      const yaml = doc.toString({ lineWidth: 0 }).replace(/\n/g, part.eol);
      replacement = part.opening ? part.opening + yaml + part.closing : `---${part.eol}${yaml}---${part.eol}${part.eol}`;
    }
    return { start: part.start, end: part.end, text: replacement };
  }
  function describe(node) {
    if (YAML.isScalar(node)) {
      if (typeof node.value === 'string') return { type: 'text', value: node.value };
      if (typeof node.value === 'number') return { type: 'number', value: String(node.value) };
      if (typeof node.value === 'boolean') return { type: 'boolean', value: String(node.value) };
    }
    if (YAML.isSeq(node) && node.items.every(item => YAML.isScalar(item) && typeof item.value === 'string' && !item.value.includes('\n') && item.value.trim() === item.value && item.value)) return { type: 'list', value: node.items.map(item => item.value).join('\n') };
    return { type: 'yaml', value: new YAML.Document(node).toString({ lineWidth: 0, verifyAliasOrder: false }).trimEnd() };
  }
  function valueOf(type, input) {
    if (type === 'boolean') return input === 'true';
    if (!input.trim()) return undefined;
    if (type === 'number') {
      const number = Number(input);
      if (!Number.isFinite(number)) throw Error('Enter a finite number.');
      return number;
    }
    if (type === 'list') return input.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (type === 'yaml') {
      const value = YAML.parseDocument(input);
      if (value.errors.length) throw Error(value.errors[0].message);
      return value.contents;
    }
    return input;
  }
  function mount({ source, trigger, layouts, appLayout, edit, refresh }) {
    let dialog = null;
    function commit(change) {
      if (!change) return;
      const start = source.selectionStart, end = source.selectionEnd, scrollTop = source.scrollTop, scrollLeft = source.scrollLeft;
      source.setSelectionRange(change.start, change.end); edit(change.text);
      const delta = change.text.length - (change.end - change.start);
      const relocate = position => position < change.start ? position : position >= change.end ? position + delta : change.start + change.text.length;
      source.setSelectionRange(relocate(start), relocate(end)); source.scrollTop = scrollTop; source.scrollLeft = scrollLeft;
      refresh();
    }
    function close() { if (dialog) { const old = dialog; dialog = null; old.close(); old.remove(); } }
    function open() {
      if (source.disabled || dialog) return;
      const original = source.value;
      dialog = document.createElement('dialog'); dialog.className = 'document-settings-dialog'; dialog.setAttribute('aria-labelledby', 'document-settings-title');
      const form = document.createElement('form'); form.className = 'app-dialog document-settings-form';
      form.addEventListener('submit', event => event.preventDefault());
      form.innerHTML = '<header><h2 id="document-settings-title">Document settings</h2><button type="button" class="app-dialog-close" aria-label="Close document settings">×</button></header><p class="app-dialog-description">Settings are saved in this document’s frontmatter and stay out of printouts. Add only the lesson information you need.</p><div class="document-settings-content"></div><p class="document-settings-error" role="alert"></p><footer><button type="button" class="document-settings-yaml">Show YAML</button><button type="button" class="document-settings-cancel">Cancel</button><button type="submit" class="document-settings-apply">Apply</button></footer>';
      dialog.append(form); document.body.append(dialog);
      const content = form.querySelector('.document-settings-content'), error = form.querySelector('[role="alert"]'), apply = form.querySelector('[type="submit"]');
      const rows = new Map(), removed = new Set(), documentChanges = new Map();
      function showError(message) { error.textContent = message; }
      form.querySelector('.app-dialog-close').onclick = close; form.querySelector('.document-settings-cancel').onclick = close;
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      form.querySelector('.document-settings-yaml').onclick = () => {
        let end = 0;
        try { end = split(source.value).end; } catch { end = source.value.indexOf('\n') + 1; }
        close(); source.focus(); source.setSelectionRange(0, end);
        source.dispatchEvent(new CustomEvent('editor:reveal-lines', { detail: { startLine: 0, endLine: source.value.slice(0, end).split('\n').length, focusEditor: true } }));
      };
      function section(title, description) {
        const section = document.createElement('section'), heading = document.createElement('h3'), note = document.createElement('p');
        heading.textContent = title; note.textContent = description; section.append(heading, note); content.append(section); return section;
      }
      function select(options, label) {
        const select = document.createElement('select'); select.setAttribute('aria-label', label);
        for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
        return select;
      }
      function setting(host, label, key, options, initial) {
        const wrapper = document.createElement('label'); wrapper.textContent = label;
        const input = select(options, label);
        // Keep an unrecognised value intact until the user explicitly changes it.
        if (!options.some(([value]) => value === initial)) { const option = document.createElement('option'); option.value = initial; option.textContent = `${initial} (current value)`; input.append(option); }
        input.value = initial; input.onchange = () => documentChanges.set(key, input.value || undefined);
        wrapper.append(input); host.append(wrapper);
      }
      try {
        const state = read(original), doc = state.document;
        const documentSection = section('Document', 'Page or presentation settings.');
        const slides = doc.get('type') === 'slides';
        if (slides) {
          setting(documentSection, 'Slide theme', 'theme', [['', 'Use default (Classroom)'], ['classroom', 'Classroom'], ['light', 'Light'], ['dark', 'Dark']], doc.get('theme') ?? '');
          setting(documentSection, 'Slide aspect ratio', 'aspect', [['', 'Use default (16:9)'], ['16:9', '16:9'], ['4:3', '4:3']], doc.get('aspect') ?? '');
        } else setting(documentSection, 'Page layout', 'layout', [['', `Use app layout (${layouts[appLayout()].label})`], ...Object.entries(layouts).map(([key, value]) => [key, value.label])], doc.get('layout') ?? '');
        const lessonSection = section('Lesson info', 'Optional information about the activity, stored together under lesson-info.');
        const properties = document.createElement('div'); properties.className = 'lesson-properties'; lessonSection.append(properties);
        const empty = document.createElement('p'); empty.className = 'lesson-info-empty'; empty.textContent = 'No lesson info yet. Choose a property below to get started.'; properties.append(empty);
        const addArea = document.createElement('div'); addArea.className = 'lesson-property-add';
        const picker = select([['', 'Choose a lesson property…']], 'Add lesson property');
        const name = document.createElement('input'); name.type = 'text'; name.placeholder = 'e.g. materials'; name.setAttribute('aria-label', 'Custom property name'); name.hidden = true;
        const customType = select(types, 'Custom property type'); customType.hidden = true;
        const add = document.createElement('button'); add.type = 'button'; add.textContent = 'Add property'; add.disabled = true;
        const hint = document.createElement('p'); hint.className = 'lesson-property-hint';
        addArea.append(picker, name, customType, add); lessonSection.append(addArea, hint);
        function updatePicker() {
          const value = picker.value; picker.replaceChildren();
          for (const [key, label] of [['', 'Choose a lesson property…'], ...suggestions.filter(item => !rows.has(item.key)).map(item => [item.key, item.label]), ['custom', 'Custom property…']]) {
            const option = document.createElement('option'); option.value = key; option.textContent = label; picker.append(option);
          }
          picker.value = [...picker.options].some(option => option.value === value) ? value : '';
          empty.hidden = rows.size > 0; picker.dispatchEvent(new Event('change'));
        }
        function addRow(key, type, value, existing = false) {
          const suggestion = suggestions.find(item => item.key === key), label = suggestion?.label || key;
          const row = document.createElement('div'); row.className = 'lesson-property'; row.dataset.property = key;
          const heading = document.createElement('div'); heading.className = 'lesson-property-heading';
          const title = document.createElement('label'); title.textContent = label;
          const code = document.createElement('code'); code.textContent = key;
          const kind = select(types, `${label} value type`); kind.value = type;
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${label}`);
          heading.append(title, code, kind, remove); row.append(heading);
          const info = document.createElement('p'); info.textContent = suggestion?.description || 'A custom property for this activity.'; row.append(info);
          const entry = { key, type, value, existing, initialType: type, initialValue: value, row, input: null };
          function buildInput() {
            const old = entry.input;
            const input = entry.type === 'boolean' ? select([['true', 'Yes'], ['false', 'No']], label) : document.createElement(entry.type === 'number' ? 'input' : 'textarea');
            if (entry.type === 'number') { input.type = 'number'; input.step = 'any'; if (key === 'duration-minutes') input.min = '0'; }
            if (input.tagName === 'TEXTAREA') { input.rows = entry.type === 'text' ? 2 : 3; input.spellcheck = entry.type !== 'yaml'; }
            input.id = `lesson-property-${rows.size}-${key.replace(/[^\w-]/g, '-')}`; title.htmlFor = input.id; input.setAttribute('aria-label', label); input.value = entry.value;
            input.oninput = () => { entry.value = input.value; showError(''); };
            input.onchange = input.oninput;
            if (old) old.replaceWith(input); else row.append(input); entry.input = input;
          }
          kind.onchange = () => { entry.type = kind.value; if (entry.type === 'boolean' && !['true', 'false'].includes(entry.value)) entry.value = 'false'; buildInput(); };
          remove.onclick = () => { rows.delete(key); if (existing) removed.add(key); row.remove(); updatePicker(); };
          rows.set(key, entry); properties.append(row); buildInput(); updatePicker();
          if (!existing) entry.input.focus();
        }
        picker.onchange = () => {
          const custom = picker.value === 'custom'; name.hidden = customType.hidden = !custom; add.disabled = !picker.value;
          hint.textContent = custom ? 'Use a unique name with letters, numbers, hyphens, or underscores. Custom properties stay inside lesson-info.' : suggestions.find(item => item.key === picker.value)?.description || 'Suggested fields are optional; blank values are not added to the file.';
        };
        add.onclick = () => {
          const suggestion = suggestions.find(item => item.key === picker.value);
          const key = suggestion?.key || name.value.trim(), type = suggestion?.type || customType.value;
          if (!/^[a-zA-Z][\w-]*$/.test(key)) { showError('Use a property name starting with a letter, followed by letters, numbers, hyphens, or underscores.'); name.focus(); return; }
          if (rows.has(key)) { showError(`The property “${key}” already exists.`); name.focus(); return; }
          showError(''); addRow(key, type, type === 'boolean' ? 'false' : ''); name.value = ''; picker.value = ''; updatePicker();
        };
        for (const pair of state.lesson?.items || []) {
          if (!YAML.isScalar(pair.key) || typeof pair.key.value !== 'string') throw Error('Lesson properties need text names. Choose Show YAML to edit this frontmatter.');
          const field = describe(pair.value); addRow(pair.key.value, field.type, field.value, true);
        }
        updatePicker();
        form.onsubmit = event => {
          event.preventDefault();
          if (source.value !== original) { showError('The document changed while settings were open. Close and reopen settings to load the latest values.'); return; }
          try {
            const lesson = [...removed].map(key => [key, undefined]);
            for (const row of rows.values()) {
              if (row.existing && row.type === row.initialType && row.value === row.initialValue) continue;
              if (row.key === 'duration-minutes' && row.type === 'number' && row.value.trim() && Number(row.value) < 0) throw Error('Duration cannot be negative.');
              lesson.push([row.key, valueOf(row.type, row.value)]);
            }
            const change = update(original, { document: [...documentChanges], lesson });
            close(); commit(change);
          } catch (failure) { showError(failure.message); }
        };
      } catch (failure) { showError(failure.message); apply.disabled = true; }
      dialog.showModal();
    }
    trigger.onclick = open;
    const syncDisabled = () => { trigger.disabled = source.disabled; };
    new MutationObserver(syncDisabled).observe(source, { attributes: true, attributeFilter: ['disabled'] }); syncDisabled();
    source.addEventListener('editor:content-loaded', close);
    return { open, close, setLayout(value) { if (!source.disabled) commit(update(source.value, { document: [['layout', value]] })); } };
  }
  return { suggestions, split, read, update, describe, valueOf, mount };
});
