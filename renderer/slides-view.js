/* Slideshow UI; independent of the handout renderer and its CSS. */
(function () {
  'use strict';
  const model = window.HandoutSlides;
  function mount(options) {
    const { source, preview, previewPanel, pageCount } = options;
    const heading = document.querySelector('.preview-heading > span');
    const toolbar = document.createElement('div'); toolbar.className = 'slide-toolbar'; toolbar.hidden = true; toolbar.setAttribute('aria-label', 'Slide controls');
    function select(label, values, visibleLabel = label) {
      const field = document.createElement('label'); field.textContent = visibleLabel + ' ';
      const input = document.createElement('select'); input.setAttribute('aria-label', label);
      for (const [value, title] of values) { const item = document.createElement('option'); item.value = value; item.textContent = title; input.append(item); }
      field.append(input); toolbar.append(field); return input;
    }
    const themeSelect = select('Slide theme', Object.entries(model.themes).map(([value, theme]) => [value, theme.name]), 'Theme');
    const aspectSelect = select('Slide aspect ratio', [['16:9', '16:9'], ['4:3', '4:3']], 'Aspect');
    const templateSelect = select('New slide', [['content', 'Blank content'], ['bell-ringer', 'Bell-ringer'], ['image-text', 'Fullscreen image with text'], ['title', 'Title slide']], 'Template');
    const templates = {
      content: '# New slide\n\nAdd your content here.',
      'image-text': ':::background overlay=dark opacity=35\n![Background](image.jpg)\n:::\n\n:::text x=8% y=65% width=84% size=54 color=white\n**Your title here**\n:::',
      title: ':::text x=8% y=25% width=84% size=72 color=$ink align=center\n**Presentation title**\n:::\n\n:::text x=12% y=52% width=76% size=32 color=$ink align=center\nSubtitle or a short description\n:::',
      'bell-ringer': "# Class Topic or Goal\n\n**Bell Ringer:** What is the most interesting organism you've observed in the garden\n\n**Agenda:**\n- Observe the example.\n- Test one idea.\n- Record your evidence.\n\n:::notes\nMaterials and teacher reminders go here.\n:::"
    };
    const template = () => templates[templateSelect.value].replace(/\$ink/g, '#' + model.themes[themeSelect.value].ink);
    function button(label, action) { const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.onclick = action; toolbar.append(item); return item; }
    const lineOffset = line => source.value.split('\n').slice(0, line).reduce((sum, text) => sum + text.length + 1, 0);
    button('Add slide', () => { const offset = lineOffset(deck.slides[selected].endLine); source.setSelectionRange(offset, offset); options.edit('\n---\n\n' + template() + '\n\n'); });
    button('Append slide', () => { const offset = source.value.length; source.setSelectionRange(offset, offset); options.edit('\n---\n\n' + template() + '\n\n'); });
    function insertSnippet(kind) {
      if (!mode) return;
      if(kind==='table'){const offset=lineOffset(deck.slides[selected].endLine);source.setSelectionRange(offset,offset);return;}
      if(kind==='fit'){applyEdit(model.overflowEdit(source.value,selected,'fit'));return;}
      if (kind === 'notes' && deck.slides[selected].notes) {
        const note = deck.slides[selected].noteSource; source.focus(); source.setSelectionRange(lineOffset(note.sourceStart), lineOffset(note.sourceEnd)); return;
      }
      const snippets = {
        columns: '\n:::columns\n:::column\n## First column\n\nAdd text or an image.\n\n:::column\n## Second column\n\nAdd text or an image.\n:::\n\n',
        background: '\n:::background\n![Background](image.jpg)\n:::\n\n',
        text: '\n:::text x=10% y=65% width=80% size=54 color=white\n**Your text here**\n:::\n\n',
        notes: '\n:::notes\nTeacher reminders go here.\n:::\n\n',
        qr: '\n[qr:https://example.com]{width=1.5in}\n\n',
        center: '\n:::center\n## Centered text\n\nAdd your content here.\n:::\n\n',
        checklist: '\n:::checklist\n- First item\n- Second item\n:::\n\n',
        grid: '\n:::grid columns=2 widths=1/2,1/2 cards\n:::cell\n## First card\n\nAdd your content here.\n:::cell\n## Second card\n\nAdd your content here.\n:::\n\n'
      };
      if (!snippets[kind]) return;
      const offset = lineOffset(kind === 'background' ? deck.slides[selected].startLine : deck.slides[selected].endLine);
      source.setSelectionRange(offset, offset); options.edit(snippets[kind], 1);
    }
    button('Present', present); button('Export PowerPoint…', options.pptx); button('Export PDF…', options.pdf);
    const navigation = document.createElement('div'); navigation.className = 'slide-navigation'; navigation.hidden = true;
    const previous = document.createElement('button'), next = document.createElement('button'), counter = document.createElement('span');
    previous.textContent = 'Previous slide'; next.textContent = 'Next slide'; counter.setAttribute('aria-live', 'polite');
    previous.onclick = () => jump(selected - 1); next.onclick = () => jump(selected + 1); navigation.append(previous, counter, next);
    const outline = document.createElement('nav'); outline.className = 'slide-outline'; outline.hidden = true; outline.setAttribute('aria-label', 'Slide outline');
    const summary = document.createElement('p'); summary.className = 'slide-warning-summary'; summary.hidden = true; summary.setAttribute('role', 'status');
    previewPanel.insertBefore(toolbar, previewPanel.firstChild); toolbar.after(navigation, outline, summary);
    const inspector = document.createElement('div'); inspector.className = 'slide-inspector'; inspector.hidden = true; inspector.setAttribute('aria-label', 'Selected slide element'); summary.after(inspector);
    let selectedElement = null, imageDimensions = new Map(), imageReady = Promise.resolve(); const dimensionCache = new Map();
    let deck, scenes = [], selected = 0, presentation, stage, presentationIndex = 0, mode = false, imageResolver, lastText, suppressPresentationJump = false;
    const commit = text => { const caret = source.selectionStart; source.setSelectionRange(0, source.value.length); options.edit(text); source.setSelectionRange(Math.min(caret, text.length), Math.min(caret, text.length)); };
    themeSelect.onchange = () => commit(model.setting(source.value, 'theme', themeSelect.value));
    aspectSelect.onchange = () => commit(model.setting(source.value, 'aspect', aspectSelect.value));
    function cursorSlide() {
      const line = source.value.slice(0, source.selectionStart).split('\n').length - 1;
      const index = deck.slides.findIndex(slide => line >= (slide.markerLine >= 0 ? slide.markerLine : slide.startLine) && line < slide.endLine);
      return index >= 0 ? index : line < deck.slides[0].startLine ? 0 : deck.slides.length - 1;
    }
    function jump(index, focusEditor = true) {
      if (!deck || index < 0 || index >= deck.slides.length) return;
      showCurrent(index);
      const offset = lineOffset(deck.slides[index].startLine); source.setSelectionRange(offset, offset); source.scrollTop = deck.slides[index].startLine * 22.4;
      if (focusEditor) source.focus(); else preview.focus({ preventScroll: true });
    }
    preview.addEventListener('keydown', event => {
      if (!mode || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      jump(selected + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1), false);
    });
    function mapSource(node, location) {
      if (Number.isInteger(location?.sourceStart) && Number.isInteger(location?.sourceEnd)) {
        node.dataset.sourceStart = location.sourceStart; node.dataset.sourceEnd = location.sourceEnd;
      }
    }
    const elementKey = element => ({ line: element.background ? element.blockStart : element.sourceStart, kind: element.background ? 'background' : element.type, occurrence: element.mediaOccurrence || 0 });
    function applyEdit(edit) { if (edit) { source.setSelectionRange(edit.start, edit.end); options.edit(edit.text, 0); } }
    function showInspector(element) {
      inspector.replaceChildren(); inspector.hidden = !element || element.footer || element.type==='shape' || !Number.isInteger(element.sourceStart);
      if (inspector.hidden) {preview.querySelectorAll('.slide-positioned-host').forEach(host=>host.classList.remove('is-selected'));return;}
      selectedElement = elementKey(element);
      preview.querySelectorAll('.slide-positioned-host').forEach(host=>{const target=scenes[selected].elements[Number(host.dataset.slideElement)];const key=elementKey(target);host.classList.toggle('is-selected',key.line===selectedElement.line && key.kind===selectedElement.kind && key.occurrence===selectedElement.occurrence);});
      const scene = scenes[selected], label = document.createElement('strong'); label.textContent = element.background ? 'Background' : element.qrSvg ? 'QR code' : element.type === 'image' ? 'Image' : element.type === 'table' ? 'Table' : 'Text'; inspector.append(label);
      const field = (name, value, change, config = {}) => {
        const wrapper = document.createElement('label'); wrapper.textContent = name + ' ';
        const input = document.createElement(config.values ? 'select' : 'input'); input.setAttribute('aria-label', name);
        if (config.values) for (const [value, name] of config.values) { const option = document.createElement('option'); option.value = value; option.textContent = name; input.append(option); }
        else { input.type = config.type || 'number'; if (config.min !== undefined) input.min = config.min; if (config.max !== undefined) input.max = config.max; input.step = config.step || '1'; }
        input.value = value; input.onchange = () => { if (input.checkValidity()) change(config.values || ['text', 'color'].includes(input.type) ? input.value : Number(input.value)); else input.reportValidity(); };
        input.addEventListener('click', event => event.stopPropagation()); wrapper.append(input); inspector.append(wrapper); return input;
      };
      if (element.background) {
        const imagePath=field('Image path', element.src, value => {const edit=model.backgroundEdit(source.value,element,{imagePath:value});imagePath.setCustomValidity(edit?'':'Use a relative image filename from your lesson folder.');if(edit)applyEdit(edit);else imagePath.reportValidity();}, { type: 'text' });
        imagePath.oninput=()=>imagePath.setCustomValidity('');
        field('Crop position', element.position, value => applyEdit(model.backgroundEdit(source.value, element, { position: value })), { values: ['center','left','right','top','bottom','top-left','top-right','bottom-left','bottom-right'].map(value => [value,value]) });
        field('Overlay', element.overlay, value => applyEdit(model.backgroundEdit(source.value, element, { overlay: value })), { values: [['none','None'],['dark','Dark'],['light','Light']] });
        field('Overlay opacity (%)', element.opacity, value => applyEdit(model.backgroundEdit(source.value, element, { opacity: value })), { min:0,max:100 });
        const remove = document.createElement('button'); remove.textContent = 'Remove background'; remove.onclick = () => { applyEdit(model.backgroundEdit(source.value, element, { remove:true })); selectedElement = null; inspector.hidden = true; }; inspector.append(remove);
      } else if (element.positioned) {
        const update = (key, value) => applyEdit(model.positionEdit(source.value, element.sourceStart, { [key]:value }));
        field('Font size (pt)', Math.round(element.fontSize / scene.textScale), value => update('size',value), {min:8,max:144});
        field('Text color', '#' + element.color, value => update('color',value), {type:'color'});
        field('Font', element.font === 'Courier New' ? 'CourierNew' : element.font || 'Arial', value => update('font',value), {values:[['Arial','Arial'],['Calibri','Calibri'],['Georgia','Georgia'],['Verdana','Verdana'],['CourierNew','Courier New']]});
        field('Text alignment', element.align, value => update('align',value), {values:[['left','Left'],['center','Center'],['right','Right']]});
        for (const [key,name,value] of [['x','Left (%)',element.x / scene.width * 100],['y','Top (%)',element.y / scene.height * 100],['width','Text width (%)',element.w / scene.width * 100]]) field(name,Math.round(value * 10) / 10,value=>update(key,value),{min:key==='width'?1:0,max:100,step:.1});
      } else if (element.type === 'image') {
        field('Image width (in)',Math.round(element.w * 100) / 100,value=>applyEdit(model.mediaEdit(source.value,element,value)),{min:Math.min(element.qrSvg ? .75 : .5,element.maxWidth),max:element.maxWidth,step:.01});
        const hint = document.createElement('span'); hint.textContent = 'Drag the resize handle to keep proportions.'; inspector.append(hint);
      } else if (element.type === 'text') {
        const convert = document.createElement('button'); convert.textContent = 'Position freely'; convert.disabled = !model.movableTextEdit(source.value,element,scene);
        convert.onclick = () => applyEdit(model.movableTextEdit(source.value,element,scene)); inspector.append(convert);
        const hint = document.createElement('span'); hint.textContent = convert.disabled ? 'Edit this element in Markdown. Lists keep native PowerPoint bullets.' : 'Make this text movable to change its position, size, color, and font.'; inspector.append(hint);
      } else { const hint=document.createElement('span'); hint.textContent='Edit table cells in the highlighted Markdown; tables stay editable in PowerPoint.'; inspector.append(hint); }
      requestAnimationFrame(fit);
    }
    function refreshInspector() {
      const element = selectedElement && scenes[selected].elements.find(element => { const key=elementKey(element); return key.line===selectedElement.line && key.kind===selectedElement.kind && key.occurrence===selectedElement.occurrence; });
      showInspector(element);
    }
    function positionedControls(host, item, element, scene, canvas) {
      const tools = document.createElement('div'); tools.className = 'slide-text-tools';
      const media = element.type === 'image';
      if (media && element.mediaAlign === 'right') { tools.style.left='0';tools.style.right='auto';tools.style.transformOrigin='top left'; }
      for (const [action, label] of media ? [['resize', element.qrSvg ? 'Resize QR code proportionally' : 'Resize image proportionally']] : [['move', 'Move text'], ['resize', 'Resize text width']]) {
        const handle = document.createElement('button'); handle.type = 'button'; handle.textContent = action === 'move' ? '↔ Move' : '↔ Width'; handle.setAttribute('aria-label', label); handle.title = action === 'move' ? 'Drag to move this text' : 'Drag to change text wrapping width';
        handle.onclick = event => event.stopPropagation();
        handle.onpointerdown = event => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          const before = source.value, rect = canvas.getBoundingClientRect(), origin = { x: element.x / scene.width * 100, y: element.y / scene.height * 100, width: element.w / scene.width * 100 };
          const style = host.getAttribute('style'), textStyle = item.getAttribute('style'), startX = event.clientX, startY = event.clientY;
          let values = { ...origin }, moved = false;
          handle.setPointerCapture(event.pointerId);
          const move = current => {
            const dx = (current.clientX - startX) / rect.width * 100, dy = (current.clientY - startY) / rect.height * 100;
            moved ||= Math.abs(current.clientX - startX) + Math.abs(current.clientY - startY) > 3;
            if (action === 'move') {
              values.x = Math.max(0, Math.min(100 - origin.width, origin.x + dx));
              values.y = Math.max(0, Math.min(Math.max(0, 100 - element.h / scene.height * 100), origin.y + dy));
              host.style.left = `${values.x / 100 * scene.width * 96}px`; host.style.top = `${values.y / 100 * scene.height * 96}px`;
            } else {
              values.width = Math.max(media ? Math.min(element.qrSvg ? .75 : .5,element.maxWidth) / scene.width * 100 : 1, Math.min(media ? element.maxWidth / scene.width * 100 : 100 - origin.x, origin.width + dx * (media && element.mediaAlign === 'right' ? -1 : 1)));
              const width = values.width / 100 * scene.width * 96;
              host.style.width = item.style.width = `${width}px`;
              if (media) {
                const ratio = element.qrSvg ? 1 : item.naturalWidth / item.naturalHeight || element.w / element.h;
                host.style.height = item.style.height = `${width / ratio}px`;
                if (element.mediaAlign === 'right') host.style.left=`${(element.x + element.w) * 96 - width}px`;
              } else { item.style.height = 'auto'; host.style.height = `${item.scrollHeight}px`; }
            }
          };
          const finish = current => {
            handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', finish); handle.removeEventListener('pointercancel', finish); handle.removeEventListener('lostpointercapture', finish); document.removeEventListener('keydown', escape, true);
            if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
            if (moved) {
              // A drag must not become a preview click after moving/cancelling.
              canvas.dataset.suppressClick = 'true';
              const clear = () => setTimeout(() => delete canvas.dataset.suppressClick, 0);
              if (current.type === 'keydown') document.addEventListener('pointerup', clear, { once: true }); else clear();
            }
            if (current.type !== 'pointerup' || !moved || source.value !== before) { host.setAttribute('style', style); item.setAttribute('style', textStyle); return; }
            const edit = media ? model.mediaEdit(before, element, values.width / 100 * scene.width) : model.positionEdit(before, element.sourceStart, action === 'move' ? { x: values.x, y: values.y } : { width: values.width });
            if (edit) { source.setSelectionRange(edit.start, edit.end); options.edit(edit.text, 0); }
          };
          const escape = key => { if (key.key === 'Escape') { key.preventDefault(); key.stopPropagation(); finish(key); } };
          handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish); handle.addEventListener('lostpointercapture', finish); document.addEventListener('keydown', escape, true);
        };
        tools.append(handle);
      }
      host.append(tools);
    }
    function canvas(scene, interactive = false) {
      const node = document.createElement('article'); node.className = 'slide-canvas';
      node.style.width = `${scene.width * 96}px`; node.style.height = `${scene.height * 96}px`;
      node.style.backgroundColor = '#' + scene.theme.background; node.style.color = '#' + scene.theme.ink; node.style.fontFamily = scene.theme.font;
      const appendRuns=(parent,runs,element)=>{for(const run of runs){
        const span=document.createElement(run.href?'a':'span');span.textContent=run.text;mapSource(span,run);
        if(run.href){span.href=run.href;span.title='Ctrl-click (⌘-click on Mac) to open in your browser';span.style.color='#'+(element.positioned?element.color:scene.theme.accent);}
        if(run.bold)span.style.fontWeight='bold';if(run.italic)span.style.fontStyle='italic';if(run.code)span.style.fontFamily='Courier New';parent.append(span);
      }};
      for (const [elementIndex, element] of scene.elements.entries()) {
        let item;
        if (element.type === 'image') {
          item = document.createElement('img'); item.alt = element.alt; item.src = element.qrSvg ? element.src : imageResolver(element.src) || '';
          if (element.qrSvg) item.classList.add('slide-qr');
          if (element.background) { item.classList.add('slide-background'); item.style.objectFit = 'cover'; item.style.objectPosition = `${element.anchor[0] * 100}% ${element.anchor[1] * 100}%`; }
          item.addEventListener('error', () => { item.classList.add('slide-image-missing'); item.title = `Could not load ${element.src}`; summary.hidden = false; summary.textContent = 'An image could not load. Check its relative filename before exporting.'; });
        } else if (element.type === 'shape') {
          item = document.createElement('div'); item.className = element.stroke ? 'slide-grid-card' : 'slide-background-overlay'; item.style.backgroundColor = '#' + element.color; item.style.opacity = element.opacity / 100;
          if(element.stroke){item.style.border='1px solid #'+element.stroke;item.style.boxSizing='border-box';}else item.style.pointerEvents = 'none';
        } else if (element.type === 'table') {
          item = document.createElement('table');
          for (const [rowIndex, row] of element.rows.entries()) { const tr = document.createElement('tr'); mapSource(tr, element.rowSources?.[rowIndex]); for (const [columnIndex,value] of row.entries()) { const td = document.createElement(rowIndex ? 'td' : 'th');if(element.cellRuns)appendRuns(td,element.cellRuns[rowIndex][columnIndex],element);else td.textContent=value;td.style.textAlign=element.alignments?.[columnIndex]||'left'; td.style.borderColor = '#' + scene.theme.muted; tr.append(td); } item.append(tr); }
          item.style.color = '#' + scene.theme.ink;
        } else {
          item = document.createElement('div'); item.className = 'slide-text';
          if(element.positioned && element.paragraphs?.some(paragraph=>paragraph.bullet)){
            for(const [i,paragraph] of element.paragraphs.entries()){
              const row=document.createElement('div');row.style.position='relative';mapSource(row,paragraph);
              if(i>0 && !(paragraph.bullet && element.paragraphs[i-1].bullet))row.style.marginTop='1.2em';
              if(paragraph.bullet){row.style.paddingLeft=((paragraph.depth||0)+1)+'em';const marker=document.createElement('span');marker.textContent=paragraph.bullet;Object.assign(marker.style,{position:'absolute',left:(paragraph.depth||0)+'em',width:'1em'});row.append(marker);}
              appendRuns(row,paragraph.runs,element);item.append(row);
            }
          }else appendRuns(item,element.runs,element);
          item.style.textAlign = element.align || 'left'; item.style.color = '#' + element.color; if (element.bold) item.style.fontWeight = 'bold';
          if (element.font) item.style.fontFamily=element.font;
        }
        mapSource(item, element);
        item.dataset.slideElement=elementIndex;
        item.style.position = 'absolute'; item.style.left = `${element.x * 96}px`; item.style.top = `${element.y * 96}px`; item.style.width = `${element.w * 96}px`; item.style.height = `${element.h * 96}px`;
        if (element.fontSize) item.style.fontSize = `${element.fontSize * 96 / 72}px`;
        if (element.positioned) item.classList.add('slide-positioned-text');
        if ((element.positioned || (element.type==='image' && !element.background)) && interactive) {
          const host = document.createElement('div'); host.className = 'slide-positioned-host' + (element.type==='image'?' slide-media-host':''); host.setAttribute('role', 'group'); host.setAttribute('aria-label', element.type==='image'?'Slide image':'Positioned text'); host.dataset.slideElement=elementIndex;
          const key=elementKey(element);if(selectedElement && key.line===selectedElement.line && key.kind===selectedElement.kind)host.classList.add('is-selected');
          Object.assign(host.style, { position: 'absolute', left: item.style.left, top: item.style.top, width: item.style.width, height: item.style.height });
          item.style.left = '0'; item.style.top = '0'; host.append(item); positionedControls(host, item, element, scene, node); node.append(host);
        } else node.append(item);
      }
      if (interactive) node.addEventListener('click', event => {
        if (node.dataset.suppressClick) { delete node.dataset.suppressClick; event.preventDefault(); event.stopImmediatePropagation(); return; }
        const selected = event.target.closest('.slide-positioned-host');
        node.querySelectorAll('.slide-positioned-host').forEach(host => host.classList.toggle('is-selected', host === selected));
        const target=event.target.closest('[data-slide-element]');
        if(target)showInspector(scene.elements[Number(target.dataset.slideElement)]);else{selectedElement=null;inspector.hidden=true;}
      }, true);
      return node;
    }
    function card(index, forExport = false) {
      const scene = scenes[index], slide = deck.slides[index];
      const item = document.createElement('section'); item.className = 'slide-card'; item.dataset.slideIndex = index;
      const frame = document.createElement('div'); frame.className = 'slide-frame'; frame.style.setProperty('--slide-width', `${scene.width}in`); frame.style.setProperty('--slide-height', `${scene.height}in`);
      frame.style.width = `${scene.width * 96}px`; frame.style.height = `${scene.height * 96}px`; frame.append(canvas(scene, !forExport)); item.append(frame);
      if (!forExport) frame.onclick = event => {
        // Mapped elements use the same source selection/reveal handler as handouts.
        if (event.target.closest('[data-source-start][data-source-end]')) return;
        event.stopPropagation(); jump(index, false);
      };
      if (scene.warnings.length) { const warning = document.createElement('p'); warning.className = 'slide-warning'; warning.textContent = scene.warnings.join(' '); item.append(warning); }
      if (!forExport && scene.overflow) overflowActions(item, index);
      if (!forExport && slide.notes) { const notes = document.createElement('details'); notes.className = 'slide-notes'; const label = document.createElement('summary'); label.textContent = 'Presenter notes'; const body = document.createElement('pre'); body.textContent = slide.notes; mapSource(body, slide.noteSource); notes.append(label, body); item.append(notes); }
      return item;
    }
    function overflowActions(item, index) {
      if (item.querySelector('.slide-overflow-actions')) return;
      const actions = document.createElement('div'); actions.className = 'slide-overflow-actions';
      for (const [action, label] of [['fit', 'Shrink text to fit'], ['columns', 'Create columns']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.disabled = !model.overflowEdit(source.value, index, action);
        if (button.disabled) button.title = action === 'fit' ? 'Automatic text fitting is already enabled, or a block needs fixing.' : scenes[index].elements.some(element => element.background || element.positioned) ? 'This slide uses a background or manually positioned text. Edit its blocks or use text fitting.' : 'Needs at least two paragraphs or list items, with no existing columns or incomplete blocks.';
        button.onclick = event => {
          event.stopPropagation();
          const edit = model.overflowEdit(source.value, index, action); if (!edit) return;
          source.setSelectionRange(edit.start, edit.end); options.edit(edit.text, 0);
        };
        actions.append(button);
      }
      item.append(actions);
    }
    function checkOverflow(parent) {
      for (const item of parent.querySelectorAll('.slide-card')) if ([...item.querySelectorAll('.slide-text')].some(node => node.scrollHeight > node.clientHeight + 4)) {
        item.classList.add('slide-overflow');
        if (!item.querySelector('.slide-warning')) { const note = document.createElement('p'); note.className = 'slide-warning'; note.textContent = 'Text may overflow its box. Shorten it or use another slide.'; item.append(note); }
        if (parent === preview) overflowActions(item, Number(item.dataset.slideIndex));
      }
    }
    function showCurrent(index) {
      selected = index; preview.replaceChildren(card(index));
      counter.textContent = `${index + 1} / ${scenes.length}`; previous.disabled = index === 0; next.disabled = index === scenes.length - 1;
      pageCount.textContent = `Slide ${index + 1} of ${scenes.length} · ${deck.settings.aspect}`;
      outline.querySelectorAll('button').forEach((button, n) => button.setAttribute('aria-current', n === index ? 'true' : 'false'));
      refreshInspector();
      previewPanel.scrollTop = 0;
      requestAnimationFrame(() => { fit(); checkOverflow(preview); });
    }
    function fit() {
      if (!mode || window.matchMedia('print').matches) return;
      const frame = preview.querySelector('.slide-frame');
      if (frame) {
        const node = frame.firstElementChild, width = parseFloat(node.style.width), height = parseFloat(node.style.height);
        const headingHeight = [...previewPanel.children].filter(node => node !== preview && !node.hidden).reduce((sum, node) => sum + node.getBoundingClientRect().height, 0);
        const scale = Math.min(1, Math.max(150, preview.clientWidth - 48) / width, Math.max(160, previewPanel.clientHeight - headingHeight - 110) / height);
        frame.style.width = `${width * scale}px`; frame.style.height = `${height * scale}px`; node.style.transform = `scale(${scale})`; node.style.setProperty('--slide-control-scale', 1 / scale);
        node.querySelectorAll('.slide-positioned-host').forEach(host=>host.querySelector('.slide-text-tools')?.classList.toggle('inside',host.getBoundingClientRect().top-node.getBoundingClientRect().top<32));
      }
      fitStage();
    }
    function fitStage() {
      if (!stage || !presentation) return;
      const node = stage.firstElementChild; if (!node) return;
      node.style.transform = `scale(${Math.min(stage.clientWidth / parseFloat(node.style.width), stage.clientHeight / parseFloat(node.style.height))})`;
    }
    function stopPresentation() { if (presentation) presentation.close(); }
    function present() {
      if (!mode || presentation) return;
      presentationIndex = selected;
      let enteredFullscreen = false;
      presentation = document.createElement('dialog'); presentation.className = 'slide-presentation'; presentation.setAttribute('aria-label', 'Slideshow presentation'); presentation.setAttribute('aria-description', 'Use arrow keys or click to change slides. Escape returns to editing.'); presentation.tabIndex = -1;
      stage = document.createElement('div'); stage.className = 'slide-stage';
      function draw() { stage.replaceChildren(canvas(scenes[presentationIndex])); presentation.dataset.slideIndex = presentationIndex; requestAnimationFrame(fitStage); }
      function advance(delta) { presentationIndex = Math.max(0, Math.min(scenes.length - 1, presentationIndex + delta)); draw(); }
      presentation.append(stage); document.body.append(presentation); presentation.showModal();
      presentation.addEventListener('keydown', event => {
        event.stopPropagation();
        if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); advance(1); }
        else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); advance(-1); }
        else if (event.key === 'Home') { event.preventDefault(); presentationIndex = 0; draw(); }
        else if (event.key === 'End') { event.preventDefault(); presentationIndex = scenes.length - 1; draw(); }
        else if (event.key === 'Escape') { event.preventDefault(); stopPresentation(); }
      });
      presentation.addEventListener('click', event => { const link = event.target.closest('a'); if (link) { event.preventDefault(); if (event.ctrlKey || event.metaKey) window.handoutDesktop?.openWebLink(link.href); } else advance(event.shiftKey ? -1 : 1); });
      presentation.addEventListener('contextmenu', event => { event.preventDefault(); advance(-1); });
      const onFullscreen = () => { if (enteredFullscreen && !document.fullscreenElement) stopPresentation(); else fitStage(); };
      document.addEventListener('fullscreenchange', onFullscreen);
      const nativeTask = window.handoutDesktop?.setPresentation ? window.handoutDesktop.setPresentation(true) : null;
      presentation.addEventListener('close', () => {
        document.removeEventListener('fullscreenchange', onFullscreen); const old = presentation; presentation = null; stage = null;
        if (nativeTask) nativeTask.then(() => window.handoutDesktop.setPresentation(false)).catch(() => {});
        if (enteredFullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
        old.remove(); if (mode && !suppressPresentationJump) jump(Math.min(presentationIndex, deck.slides.length - 1)); suppressPresentationJump = false;
      }, { once: true });
      draw(); presentation.focus();
      if (!nativeTask && !document.fullscreenElement) document.documentElement.requestFullscreen?.().then(() => { enteredFullscreen = true; fitStage(); }).catch(() => {});
      nativeTask?.then(fitStage).catch(stopPresentation);
    }
    function render(text, resolveImage) {
      if (presentation && text !== lastText) { suppressPresentationJump = true; stopPresentation(); }
      lastText = text;
      const parsed = model.parse(text); mode = parsed.enabled;
      document.body.classList.toggle('slides-document', mode); toolbar.hidden = !mode; navigation.hidden = !mode; outline.hidden = !mode; summary.hidden = true;
      if (mode) { preview.tabIndex = 0; preview.setAttribute('aria-label', 'Slide preview. Use arrow keys to change slides.'); }
      else { preview.removeAttribute('tabindex'); preview.removeAttribute('aria-label'); }
      if (heading) heading.textContent = mode ? 'Slide preview' : 'Print preview';
      if (!mode) { inspector.hidden=true;selectedElement=null;if (presentation) stopPresentation(); return false; }
      deck = parsed; imageResolver = resolveImage; imageDimensions=new Map();
      const loading=[];
      const collect=blocks=>{for(const block of blocks){
        if(block.type==='image' && !block.qrSvg && (block.mediaWidth || block.mediaHeight)){
          const url=resolveImage(block.src);if(url){
            if(!dimensionCache.has(url)){
              const entry={value:null};const image=new Image();image.src=url;
              entry.promise=image.decode().then(()=>entry.value={width:image.naturalWidth,height:image.naturalHeight}).catch(()=>null);dimensionCache.set(url,entry);
            }
            const entry=dimensionCache.get(url);if(entry.value)imageDimensions.set(block.src,entry.value);else loading.push(entry.promise.then(value=>({src:block.src,value})));
          }
        }
        if(block.blocks)collect(block.blocks);if(block.columns)block.columns.forEach(collect);
      }};deck.slides.forEach(slide=>collect(slide.blocks));
      scenes = deck.slides.map((_, index) => model.scene(deck, index,imageDimensions));
      imageReady=Promise.all(loading).then(results=>{if(deck!==parsed)return;let changed=false;for(const result of results)if(result?.value){imageDimensions.set(result.src,result.value);changed=true;}if(changed){scenes=deck.slides.map((_,index)=>model.scene(deck,index,imageDimensions));showCurrent(selected);}});
      themeSelect.value = deck.settings.theme; aspectSelect.value = deck.settings.aspect;
      outline.replaceChildren();
      for (const [index, slide] of deck.slides.entries()) { const item = document.createElement('button'); item.textContent = `${index + 1}. ${model.plain(slide.outlineTitle || slide.title) || 'Untitled slide'}`; item.onclick = () => jump(index); outline.append(item); }
      if (deck.warnings.length) { summary.hidden = false; summary.textContent = deck.warnings.join(' '); }
      let style = document.querySelector('#dynamic-page-size'); if (!style) { style = document.createElement('style'); style.id = 'dynamic-page-size'; document.head.append(style); }
      style.textContent = `@page { size: ${scenes[0].width}in 7.5in; margin: 0; }`;
      showCurrent(cursorSlide()); syncSelection(); return true;
    }
    function syncSelection() { if (mode && deck) {
      const index = cursorSlide(); if (index !== selected) showCurrent(index);
      const line=source.value.slice(0,source.selectionStart).split('\n').length-1;
      const target=scenes[selected].elements.find(element=>!element.footer && line >= (element.background?element.blockStart:element.sourceStart) && line < (element.background?element.blockEnd:element.sourceEnd));
      if(target)showInspector(target);else{selectedElement=null;inspector.hidden=true;}
    } }
    source.addEventListener('select', syncSelection); source.addEventListener('keyup', syncSelection); source.addEventListener('pointerup', syncSelection);
    new ResizeObserver(fit).observe(previewPanel); window.addEventListener('resize', fit);
    async function ready(parent = preview) { await document.fonts.ready; await Promise.all([...parent.querySelectorAll('img')].map(image => image.decode().catch(() => {}))); }
    function allowExport(parent = preview) {
      checkOverflow(parent);
      const warned = deck.warnings.length || scenes.some(scene => scene.warnings.length) || parent.querySelector('.slide-warning') || [...parent.querySelectorAll('img')].some(image => !image.complete || !image.naturalWidth);
      return !warned || window.confirm('Some slides have overflow or image warnings. Review the deck before sharing. Export anyway?');
    }
    let exporting = false;
    async function withAllSlides(action) {
      if (exporting) return;
      exporting = true; const printDeck = document.createElement('div'); printDeck.className = 'slide-print-deck'; printDeck.setAttribute('aria-hidden', 'true');
      const exportingDeck=deck;
      try { await imageReady;if(deck!==exportingDeck)return;scenes.forEach((_, index) => printDeck.append(card(index, true))); document.body.append(printDeck);await ready(printDeck); if (allowExport(printDeck)) return await action(); }
      finally { printDeck.remove(); exporting = false; }
    }
    return { render, fit, present, insertSnippet, ready, allowExport, withAllSlides, get deck() { return deck; }, get selected() { return selected; }, leaveDocument: () => { selectedElement=null;inspector.hidden=true;if (presentation) { suppressPresentationJump = true; stopPresentation(); } }, stopPresentation };
  }
  window.SlideStudio = { mount };
})();
