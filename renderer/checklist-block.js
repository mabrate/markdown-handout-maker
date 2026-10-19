(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HandoutChecklist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function renderChecklistBlock(renderedMarkdown) {
    return String(renderedMarkdown || '').replace(/<ul(?=[\s>])([^>]*)>/, '<ul class="checklist"$1>');
  }

  return { renderChecklistBlock };
});
