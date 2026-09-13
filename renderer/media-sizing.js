(function exposeMediaSizing(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HandoutMediaSizing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function makeMediaSizing() {
  'use strict';

  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(?:\{([^}]*)\})?/g;
  const qrPattern = /\[qr:([^\]]*)\](?:\{([^}]*)\})?/gi;

  function withUpdatedWidth(attributes, width) {
    const retained = String(attributes || '').split(/\s+/).filter(Boolean).filter(attribute => !/^width=/i.test(attribute));
    retained.push(`width=${width}`);
    return retained.join(' ');
  }

  function updateImageWidth(markdown, targetIndex, width) {
    const frontMatter = markdown.match(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/);
    const prefix = frontMatter ? frontMatter[0] : '';
    const content = markdown.slice(prefix.length);
    let imageIndex = 0;
    const updated = content.replace(imagePattern, (match, alt, imagePath, title, attributes = '') => {
      if (imageIndex++ !== targetIndex) return match;
      return `![${alt}](${imagePath}${title ? ` "${title}"` : ''}){${withUpdatedWidth(attributes, width)}}`;
    });
    return prefix + updated;
  }

  function updateQrWidth(markdown, targetIndex, width) {
    let qrIndex = 0;
    return markdown.replace(qrPattern, (match, value, attributes = '') => {
      if (qrIndex++ !== targetIndex) return match;
      return `[qr:${value}]{${withUpdatedWidth(attributes, width)}}`;
    });
  }

  return { updateImageWidth, updateQrWidth };
});
