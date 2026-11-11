(function (factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else window.HandoutInsert = factory();
})(function () {
  'use strict';
  // This catalog drives both the native menu and renderer-side command checks.
  const groups = [
    { items: [
      { id: 'image', label: 'Image…', saved: true },
      { id: 'drawing', label: 'Drawing…', saved: true },
      { id: 'link', label: 'Link…', accelerator: 'CmdOrCtrl+K' },
      { id: 'internal-link', label: 'Link to Heading…', slideLabel: 'Link to Slide…' },
      { id: 'qr', label: 'QR Code', snippet: 'qr' },
      { id: 'youtube', label: 'YouTube Video', snippet: 'youtube' },
      { id: 'video', label: 'Local Video', snippet: 'video' }
    ] },
    { label: 'Text & Tables', items: [
      { id: 'heading', label: 'Heading', snippet: 'heading' },
      { id: 'checklist', label: 'Checklist', snippet: 'checklist' },
      { id: 'table', label: 'Table…', dialog: 'table' },
      { id: 'rubric', label: 'Rubric…', dialog: 'rubric' }
    ] },
    { label: 'Layout', items: [
      { id: 'columns', label: 'Columns…', dialog: 'columns' },
      { id: 'cards', label: 'Card Grid', snippet: 'cards' },
      { id: 'wrap', label: 'Image + Text Wrap', snippet: 'wrap', format: 'handout' },
      { id: 'pagebreak', label: 'Page Break', snippet: 'pagebreak', format: 'handout' }
    ] },
    { label: 'Handout Elements', items: [
      { id: 'question', label: 'Question…', dialog: 'question', format: 'handout' },
      ...[['lines', 'Answer Lines'], ['inline-lines', 'Inline Answer'], ['space', 'Drawing Space'], ['box', 'Box Space'],
        ['dots', 'Dot-grid Space'], ['total-points', 'Total Points'], ['grade-box', 'Grade Box']]
        .map(([id, label]) => ({ id, label, snippet: id, format: 'handout' }))
    ] },
    { label: 'Slide Elements', items: [
      ...[['background', 'Background Image'], ['text', 'Positioned Text'], ['notes', 'Presenter Notes'],
        ['center', 'Centered Text'], ['list', 'List Layout'], ['footer', 'Footer']]
        .map(([id, label]) => ({ id, label, slideSnippet: id, format: 'slides' }))
    ] },
    { label: 'Advanced', items: [{ id: 'style', label: 'Style Block', snippet: 'style', format: 'handout' }] }
  ];
  const find = id => groups.flatMap(group => group.items).find(item => item.id === id);
  const applicable = (item, { mode, hasDocument = true, saved = false }) => !!item && hasDocument &&
    (!item.format || item.format === mode) && (!item.saved || saved);
  function build(context, send) {
    const itemTemplate = item => ({ id: 'insert-' + item.id, label: context.mode === 'slides' && item.slideLabel || item.label,
      enabled: applicable(item, context), ...(item.accelerator ? { accelerator: item.accelerator } : {}),
      ...(item.saved && !context.saved ? { toolTip: 'Save the document before adding image files.' } : {}),
      click: () => send('insert-content', item.id) });
    return groups.flatMap((group, index) => group.label ? [{ label: group.label,
      enabled: group.items.some(item => applicable(item, context)), submenu: group.items.map(itemTemplate) }]
      : [...group.items.map(itemTemplate), ...(index < groups.length - 1 ? [{ type: 'separator' }] : [])]);
  }
  return { groups, find, applicable, build };
});
