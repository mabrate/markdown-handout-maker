'use strict';
const fs = require('fs/promises');
const path = require('path');
const { safeDocumentName, markdownExtension } = require('./documentFiles');
async function checkedPath(root, target) {
  if (typeof root !== 'string' || typeof target !== 'string') throw Error('Choose a folder first.');
  const realRoot = await fs.realpath(root);
  const real = await fs.realpath(target);
  const relative = path.relative(realRoot, real);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw Error('The item is outside the open folder.');
  return real;
}
function folderName(value) {
  const name = String(value || '').trim();
  if (!name || name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) || name.startsWith('.')) throw Error('Enter a visible folder name without slashes or special characters.');
  return name;
}
async function createEntry(root, parent, name, type) {
  parent = await checkedPath(root, parent);
  if (!(await fs.stat(parent)).isDirectory()) throw Error('Choose a destination folder.');
  name = type === 'folder' ? folderName(name) : safeDocumentName('', folderName(name));
  const destination = path.join(parent, name);
  if (type === 'folder') await fs.mkdir(destination);
  else await fs.writeFile(destination, '', { flag: 'wx' });
  return { path: destination, name, type: type === 'folder' ? 'folder' : 'file', markdown: type !== 'folder' };
}
function rebaseReferences(content, oldPath, newPath) {
  function rebase(url) {
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) return url;
    const match = url.match(/^([^?#]*)(.*)$/);
    let decoded;
    try { decoded = decodeURIComponent(match[1]); } catch { return url; }
    const relative = path.relative(path.dirname(newPath), path.resolve(path.dirname(oldPath), decoded)).split(path.sep).join('/');
    return relative.split('/').map(part => encodeURIComponent(part).replace(/[()]/g, c => `%${c.charCodeAt(0).toString(16)}`)).join('/') + match[2];
  }
  // Keep fenced and inline code literal; rewrite inline, reference-style and HTML destinations.
  return content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/(!?\[[^\]\n]*\]\(\s*)(?:<([^>]+)>|([^\s)]+))/g, (all, prefix, angle, plain) => prefix + (angle !== undefined ? `<${rebase(angle)}>` : rebase(plain)))
    .replace(/^(\s{0,3}\[[^\]\n]+\]:\s*)(?:<([^>]+)>|(\S+))/gm, (all, prefix, angle, plain) => prefix + (angle !== undefined ? `<${rebase(angle)}>` : rebase(plain)))
    .replace(/(\b(?:src|href)\s*=\s*)(["'])(.*?)\2/gi, (all, prefix, quote, url) => prefix + quote + rebase(url) + quote)).join('');
}
async function moveHandout(root, source, parent, content) {
  source = await checkedPath(root, source); parent = await checkedPath(root, parent);
  if (!markdownExtension.test(source) || !(await fs.stat(source)).isFile() || !(await fs.stat(parent)).isDirectory()) throw Error('Choose a handout and destination folder.');
  const destination = path.join(parent, path.basename(source));
  const original = await fs.readFile(source, 'utf8');
  if (typeof content !== 'string') content = original;
  if (source === destination) return { path: source, name: path.basename(source), content };
  const updated = rebaseReferences(content, source, destination);
  await fs.writeFile(destination, updated, { flag: 'wx' });
  try { await fs.unlink(source); } catch (error) { await fs.unlink(destination); throw error; }
  return { path: destination, name: path.basename(destination), content: updated };
}
module.exports = { createEntry, moveHandout, rebaseReferences, checkedPath };
