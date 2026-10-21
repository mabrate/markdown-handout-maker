/* Contextual handout controls edit supported Markdown, never preview-only styles. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HandoutSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const patterns = {
    image: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\{([^}]*)\})?/g,
    qr: /\[qr:([^\]]*)\](?:\{([^}]*)\})?/gi,
    space: /\{\{space:(\d+)(?::(blank|box|dots))?\}\}/g,
    lines: /\{\{lines:(\d+)(?::(inline|new))?\}\}/g
  };
  function attribute(text, key, value) {
    const tokens = String(text || '').split(/\s+/).filter(Boolean).filter(token => !token.startsWith(key + '='));
    if (value !== '' && value !== undefined) tokens.push(`${key}=${value}`);
    return tokens.join(' ');
  }
  function questionAnswers(lines, start) {
    const body = [], answers = [];
    for (let index = start + 1; index < lines.length; index++) {
      const line = lines[index];
      if (line.trim() === ':::answer') {
        while (++index < lines.length && lines[index].trim() !== ':::') answers.push(lines[index]);
        continue;
      }
      if (/^:::(?:$|cell\b|question\b|grid\b)/.test(line.trim())) break;
      body.push(line);
    }
    const choices = [];
    for (const line of body) {
      const match = /^\s*[-*+]\s+(.+)$/.exec(line);
      if (match) {
        const value = match[1].trim(), correct = /\*$/.test(value);
        choices.push({index:choices.length,text:correct ? value.replace(/\s*\*$/, '') : value,correct});
      } else if (choices.length) choices[choices.length-1].text += '\n' + line;
    }
    return {answer:answers.join('\n').trim(),correctChoices:choices.filter(choice=>choice.correct).map(({index,text})=>({index,text:text.trim()}))};
  }
  function read(text, target) {
    const lines = text.split('\n'), line = lines[target.line];
    if (line === undefined) return null;
    const offset = lines.slice(0, target.line).reduce((sum, value) => sum + value.length + 1, 0);
    if (patterns[target.kind]) {
      const content = lines.slice(target.line, target.endLine || target.line + 1).join('\n');
      const match = [...content.matchAll(new RegExp(patterns[target.kind]))][target.occurrence || 0];
      if (!match) return null;
      const result = { ...target, start: offset + match.index, end: offset + match.index + match[0].length, raw: match[0] };
      if (target.kind === 'image' || target.kind === 'qr') {
        const attrs = target.kind === 'image' ? match[4] || '' : match[2] || '';
        return { ...result, attrs, width: /(?:^|\s)width=([^\s]+)/.exec(attrs)?.[1] || '', float: /(?:^|\s)\.(float-left|float-right)(?:\s|$)/.exec(attrs)?.[1] || '', path: match[2], alt: match[1], title: match[3], url: match[1] };
      }
      return { ...result, count: Number(match[1]), variant: match[2] || (target.kind === 'space' ? 'blank' : 'new') };
    }
    if (target.kind === 'table') {
      const separator = lines[target.line+1];
      if (!separator || !/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(separator)) return null;
      const cells = [...separator.matchAll(/:?-+:?/g)], cell=cells[target.column];
      if (!cell) return null;
      return {...target,start:offset+line.length+1+cell.index,end:offset+line.length+1+cell.index+cell[0].length,align:cell[0].startsWith(':')&&cell[0].endsWith(':')?'center':cell[0].endsWith(':')?'right':'left'};
    }
    const match = new RegExp(`^\\s*:::${target.kind}(?:\\s+(.*))?\\s*$`).exec(line);
    if (!match || !['question','grid'].includes(target.kind)) return null;
    const attrs = match[1] || '', get = key => new RegExp(`(?:^|\\s)${key}=([^\\s]+)`).exec(attrs)?.[1];
    const answers = target.kind === 'question' ? questionAnswers(lines,target.line) : null;
    return { ...target, start: offset, end: offset + line.length, attrs, answers, points: get('points') || '', lines: Number(get('lines')) || 3, type: get('type') || 'mc', columns: get('widths')?.split(',').length || Number(get('columns')) || target.defaultColumns || 2, widths: get('widths') || '', cards: /(?:^|\s)cards(?:\s|$)/.test(attrs) };
  }
  function edit(text, target, key, value) {
    const item = read(text, target);
    if (!item) return null;
    let replacement;
    if (['image','qr'].includes(item.kind)) {
      let attrs = item.attrs, path = item.path, alt = item.alt, url = item.url;
      if (key === 'width') {
        if (value && !/^(?:\d+(?:\.\d+)?|\.\d+)(?:in|cm|mm|px|%)$/.test(value)) return null;
        if (value && parseFloat(value) <= 0) return null;
        attrs = attribute(attrs, 'width', value);
      } else if (key === 'float') {
        if (!['','float-left','float-right'].includes(value)) return null;
        attrs = attrs.split(/\s+/).filter(token => token && !/^\.float-(?:left|right)$/.test(token)).join(' ');
        if (value) attrs += `${attrs ? ' ' : ''}.${value}`;
      } else if (key === 'path' && item.kind === 'image') {
        if (!value.trim() || /[\r\n]/.test(value)) return null;
        path = value.trim().replace(/\s/g, character => encodeURIComponent(character)).replace(/[()]/g, character => character === '(' ? '%28' : '%29');
      } else if (key === 'alt' && item.kind === 'image') {
        if (/[\[\]\r\n]/.test(value)) return null;
        alt = value;
      } else if (key === 'url' && item.kind === 'qr') {
        try { if (!['http:','https:'].includes(new URL(value).protocol) || /[\s\[\]]/.test(value)) return null; } catch { return null; }
        url = value;
      } else return null;
      replacement = item.kind === 'image' ? `![${alt}](${path}${item.title ? ` "${item.title}"` : ''})` : `[qr:${url}]`;
      if (attrs) replacement += `{${attrs}}`;
    } else if (['space','lines'].includes(item.kind)) {
      const count = key === 'count' ? Number(value) : item.count, variant = key === 'variant' ? value : item.variant;
      if (!Number.isInteger(count) || count < 1 || count > 30 || !(item.kind === 'space' ? ['blank','box','dots'] : ['new','inline']).includes(variant)) return null;
      replacement = `{{${item.kind}:${count}${variant === 'new' || variant === 'blank' ? '' : ':' + variant}}}`;
    } else if (item.kind === 'table') {
      if (key !== 'align' || !['left','center','right'].includes(value)) return null;
      replacement = {left:':---',center:':---:',right:'---:'}[value];
    } else {
      let attrs = item.attrs;
      if (item.kind === 'question') {
        if (key === 'points' && value !== '' && (!Number.isFinite(Number(value)) || value < 0 || value > 100)) return null;
        if (key === 'lines' && (!Number.isInteger(Number(value)) || value < 1 || value > 30)) return null;
        if (!['points','lines'].includes(key)) return null;
        attrs = attribute(attrs,key,value);
      } else {
        if (key === 'cards') attrs = attrs.split(/\s+/).filter(token => token && token !== 'cards').concat(value ? ['cards'] : []).join(' ');
        else if (key === 'columns') {
          if (!Number.isInteger(Number(value)) || value < 1 || value > 4) return null;
          attrs = attribute(attribute(attrs,'widths',''),'columns',value);
        } else if (key === 'widths') {
          if (value && (!/^\d+\/\d+(?:,\d+\/\d+){0,3}$/.test(value) || value.split(',').some(fraction => fraction.split('/').some(part => Number(part) <= 0)))) return null;
          attrs = attribute(attrs,'widths',value);
        } else return null;
      }
      replacement = `:::${item.kind}${attrs ? ' ' + attrs : ''}`;
    }
    return { start: item.start, end: item.end, text: replacement };
  }
  function mount({ source, preview, previewPanel, edit: replace, isSlides }) {
    const panel = document.createElement('div'); panel.className = 'handout-inspector'; panel.hidden = true; panel.setAttribute('aria-label','Handout settings');
    previewPanel.insertBefore(panel,preview);
    let targets = [], version = source.value;
    const hide = () => { panel.hidden = true; targets = []; };
    function update(target,key,value,input) {
      if (source.value !== version || isSlides()) { hide(); return; }
      const change = edit(source.value,target,key,value);
      if (!change) { input?.setCustomValidity('Use a valid value for this setting.'); input?.reportValidity(); return; }
      const delta = change.text.split('\n').length - source.value.slice(change.start,change.end).split('\n').length;
      for (const selected of targets) {
        if (selected.line > target.line) selected.line += delta;
        if (selected.endLine > target.line) selected.endLine += delta;
      }
      source.setSelectionRange(change.start,change.end); replace(change.text,0); version = source.value;
      build();
    }
    function build() {
      panel.replaceChildren();
      for (const target of targets) {
        const item = read(source.value,target); if (!item) continue;
        const group = document.createElement('div'); group.className = 'handout-settings-group';
        const title = document.createElement('strong'); title.textContent = {image:'Image',qr:'QR code',space:'Drawing space',lines:'Answer lines',table:`Table column ${item.column+1}`,question:'Question',grid:'Grid'}[item.kind]; group.append(title);
        function field(label,key,value,config={}) {
          const wrapper=document.createElement('label'); wrapper.textContent=label+' ';
          const input=document.createElement(config.values?'select':'input'); input.setAttribute('aria-label',label);
          if(config.values) for(const [value,name] of config.values){const option=document.createElement('option');option.value=value;option.textContent=name;input.append(option);}
          else {input.type=config.type||'text';if(config.min!==undefined)input.min=config.min;if(config.max!==undefined)input.max=config.max;if(config.step)input.step=config.step;}
          input.value=value; if(config.type==='checkbox')input.checked=!!value;
          if(config.placeholder)input.placeholder=config.placeholder;
          input.oninput=()=>input.setCustomValidity('');
          input.onchange=()=>{if(input.checkValidity())update(target,key,input.type==='checkbox'?input.checked:input.value,input);else input.reportValidity();};
          wrapper.append(input); group.append(wrapper); return input;
        }
        if (['image','qr'].includes(item.kind)) {
          if(item.kind==='image'){field('Image path','path',item.path);field('Alt text','alt',item.alt);}
          else field('QR URL','url',item.url,{type:'url'});
          const width=field('Width','width',item.width,{placeholder:item.kind==='qr'?'1.5in (default)':'Automatic'});width.title='Use in, cm, mm, px, or %, for example 2in. Leave blank for automatic sizing.';
          field('Placement','float',item.float,{values:[['','In flow'],['float-left','Float left'],['float-right','Float right']]});
        } else if(item.kind==='question') {
          field('Points','points',item.points,{type:'number',min:0,max:100,step:.5,placeholder:'Optional'});
          if(!['mc','true-false'].includes(item.type))field('Answer lines','lines',item.lines,{type:'number',min:1,max:30});
          const answers=document.createElement('div'); answers.className='handout-question-answers'; answers.setAttribute('role','note'); answers.setAttribute('aria-label','Teacher answer');
          const answerTitle=document.createElement('strong'); answerTitle.textContent='Answer';
          const answerText=document.createElement('div'); answerText.textContent=item.answers.correctChoices.length ? item.answers.correctChoices.map(choice=>`${String.fromCharCode(65+choice.index)}. ${choice.text}`).join('\n') : item.answers.answer || 'No answer provided.';
          answers.append(answerTitle,answerText);group.append(answers);
        } else if(item.kind==='grid') {
          field('Columns','columns',item.columns,{type:'number',min:1,max:4});
          field('Column widths','widths',item.widths,{placeholder:'Equal, or 1/3,2/3'});
          field('Card borders','cards',item.cards,{type:'checkbox'});
        } else if(item.kind==='table')field('Column alignment','align',item.align,{values:[['left','Left'],['center','Center'],['right','Right']]});
        else {
          field(item.kind==='space'?'Height (lines)':'Line count','count',item.count,{type:'number',min:1,max:30});
          field(item.kind==='space'?'Drawing style':'Answer placement','variant',item.variant,{values:item.kind==='space'?[['blank','Blank'],['box','Box'],['dots','Dot grid']]:[['new','New line'],['inline','Inline']]});
        }
        panel.append(group);
      }
      panel.hidden = !panel.childElementCount;
      if (!panel.hidden) {const close=document.createElement('button');close.type='button';close.textContent='Close settings';close.onclick=hide;panel.append(close);}
    }
    function show(target) {
      if(isSlides()){hide();return;}
      targets=[];version=source.value;
      const mapped=target.closest('[data-source-start][data-source-end]');
      if(!mapped){hide();return;}
      function add(node,kind,occurrence=0,extra={}){if(!node)return;const item={kind,line:Number(node.dataset.sourceStart),endLine:Number(node.dataset.sourceEnd),occurrence,...extra};if(read(source.value,item))targets.push(item);}
      const media=target.closest('img[data-image-path],.qr-code,.qr-code-error');
      if(media){const kind=media.matches('img')?'image':'qr';const selector=kind==='image'?'img[data-image-path]':'.qr-code,.qr-code-error';const owner=media.closest('[data-source-start][data-source-end]');const siblings=owner.matches(selector)?[owner]:Array.from(owner.querySelectorAll(selector));add(owner,kind,Math.max(0,siblings.indexOf(media)));}
      else if(target.closest('.drawing-space,.answer-lines,.inline-answer')){
        const space=target.closest('.drawing-space');const selector=space?'.drawing-space':'.answer-lines:not(.inline-followups),.inline-answer';const item=target.closest(selector);const siblings=mapped.matches(selector)?[mapped]:Array.from(mapped.querySelectorAll(selector));add(mapped,space?'space':'lines',Math.max(0,siblings.indexOf(item)));
      } else if(target.closest('td,th'))add(target.closest('table[data-source-start]'),'table',0,{column:target.closest('td,th').cellIndex});
      add(target.closest('.question[data-source-start]'),'question');
      const grid=target.closest('.grid[data-source-start]');
      if(grid)add(grid,'grid',0,{defaultColumns:Math.max(1,Math.min(4,grid.children.length))});
      build();
    }
    source.addEventListener('editor:content-loaded',hide);
    return {show,refresh(){if(isSlides()||source.value!==version)hide();else if(targets.length)build();},hide};
  }
  return {read,edit,mount};
});
