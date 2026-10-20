/* Local clipboard conversion. No pasted HTML is inserted into the document. */
(function (root) {
  function delimited(text, delimiter = '\t') {
    const rows = [[]]; let value = '', quoted = false;
    text = text.replace(/\r\n?/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && (quoted || !value)) { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === delimiter || c === '\n')) { rows[rows.length - 1].push(value); value = ''; if (c === '\n') rows.push([]); }
      else value += c;
    }
    rows[rows.length - 1].push(value);
    if (rows.length > 1 && rows.at(-1).length === 1 && !rows.at(-1)[0]) rows.pop();
    return rows;
  }
  const escape = text => text.replace(/([\\`*_{}\[\]<>])/g, '\\$1');
  function table(rows) {
    if (!rows.length) return '';
    const width = Math.max(...rows.map(row => row.length));
    const line = row => '| ' + Array.from({ length: width }, (_, i) => escape(String(row[i] ?? '')).replace(/\|/g, '\\|').replace(/\n/g, '<br>')).join(' | ') + ' |';
    return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
  }
  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    function walk(node, depth = 0) {
      if (node.nodeType === 3) return escape(node.textContent.replace(/\s+/g, ' '));
      if (node.nodeType !== 1 || /^(SCRIPT|STYLE|META|LINK|IFRAME|OBJECT|SVG|IMG)$/.test(node.tagName)) return '';
      const tag = node.tagName;
      if (tag === 'TABLE') return '\n\n' + table(Array.from(node.rows, row => Array.from(row.cells, cell => cell.textContent.trim()))) + '\n\n';
      if (tag === 'UL' || tag === 'OL') return '\n' + Array.from(node.children).filter(n => n.tagName === 'LI').map((li, i) => '  '.repeat(depth) + (tag === 'OL' ? `${i + 1}. ` : '- ') + Array.from(li.childNodes, n => walk(n, depth + 1)).join('').trim() + '\n').join('') + '\n';
      const content = Array.from(node.childNodes, n => walk(n, depth)).join('');
      if (/^H[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(Number(tag[1])) + ' ' + content.trim() + '\n\n';
      if (tag === 'BR') return '\n';
      if (tag === 'SPAN' && /font-weight:\s*(bold|[6-9]00)/i.test(node.getAttribute('style') || '')) return '**' + content + '**';
      if (tag === 'SPAN' && /font-style:\s*italic/i.test(node.getAttribute('style') || '')) return '*' + content + '*';
      if (tag === 'STRONG' || tag === 'B' && !/font-weight:\s*(normal|400)/.test(node.getAttribute('style') || '')) return content.trim() ? '**' + content + '**' : content;
      if (tag === 'EM' || tag === 'I') return '*' + content + '*';
      if (tag === 'A') { const href = node.getAttribute('href') || ''; return /^(https?:|mailto:)/i.test(href) ? `[${content}](${href.replace(/[()\s]/g, c => '%' + c.charCodeAt(0).toString(16))})` : content; }
      return /^(P|DIV|BLOCKQUOTE)$/.test(tag) ? '\n\n' + content.trim() + '\n\n' : content;
    }
    return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim();
  }
  const api = { delimited, table, htmlToMarkdown };
  if (typeof module === 'object') module.exports = api; else root.HandoutClipboard = api;
})(typeof window === 'object' ? window : globalThis);
