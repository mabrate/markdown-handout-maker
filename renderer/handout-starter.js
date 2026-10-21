/* Shared starter for untitled handouts and newly created Markdown files. */
(function (root) {
  const starter = '---\nlayout: letter\n---\n\n**Name:** ______________________________  **Date:** _______________  **Period:** ______\n\n# Handout title\n\n';
  if (typeof module === 'object') module.exports = starter;
  else root.HandoutStarter = starter;
})(typeof window === 'object' ? window : globalThis);
