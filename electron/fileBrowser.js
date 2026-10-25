'use strict';
const fs = require('fs/promises');
const path = require('path');
const { safeDocumentName, markdownExtension } = require('./documentFiles');
const handoutStarter = require('../renderer/handout-starter');
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
  else await fs.writeFile(destination, handoutStarter, { flag: 'wx' });
  return { path: destination, name, type: type === 'folder' ? 'folder' : 'file', markdown: type !== 'folder', ...(type !== 'folder' ? { content: handoutStarter } : {}) };
}
function rebaseReferences(content, oldPath, newPath, mapTarget = target => target) {
  function rebase(url) {
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(url)) return url;
    const match = url.match(/^([^?#]*)(.*)$/);
    let decoded;
    try { decoded = decodeURIComponent(match[1]); } catch { return url; }
    const relative = path.relative(path.dirname(newPath), mapTarget(path.resolve(path.dirname(oldPath), decoded))).split(path.sep).join('/');
    return relative.split('/').map(part => encodeURIComponent(part).replace(/[()]/g, c => `%${c.charCodeAt(0).toString(16)}`)).join('/') + match[2];
  }
  // Keep fenced and inline code literal; rewrite inline, reference-style and HTML destinations.
  return content.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/(!?\[[^\]\n]*\]\(\s*)(?:<([^>]+)>|([^\s)]+))/g, (all, prefix, angle, plain) => prefix + (angle !== undefined ? `<${rebase(angle)}>` : rebase(plain)))
    .replace(/^(\s{0,3}\[[^\]\n]+\]:\s*)(?:<([^>]+)>|(\S+))/gm, (all, prefix, angle, plain) => prefix + (angle !== undefined ? `<${rebase(angle)}>` : rebase(plain)))
    .replace(/(\[video:)([^\]\n]+)(\])/gi, (all,prefix,url,close) => prefix + rebase(url) + close)
    .replace(/(\b(?:src|href)\s*=\s*)(["'])(.*?)\2/gi, (all, prefix, quote, url) => prefix + quote + rebase(url) + quote)).join('');
}
function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function replaceContent(target, content, mode) {
  const temporary = `${target}.${require('crypto').randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, { flag: 'wx', mode });
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, { force: true }); }
}
async function moveFolder(root, source, parent, drafts = []) {
  const realSource = await checkedPath(root, source), realParent = await checkedPath(root, parent);
  // Keep the tree's paths (e.g. macOS /var versus /private/var) for tabs and drafts.
  source = path.resolve(source); parent = path.resolve(parent);
  if (!(await fs.lstat(source)).isDirectory() || !(await fs.stat(parent)).isDirectory()) throw Error('Choose a folder and destination folder.');
  if (realSource === await fs.realpath(root)) throw Error('The open root folder cannot be moved.');
  if (isWithin(realSource, realParent)) throw Error('A folder cannot be moved into itself or one of its subfolders.');
  const destination = path.join(parent, path.basename(source));
  if (path.dirname(realSource) === realParent) return { path: source, name: path.basename(source), documents: [] };
  try { await fs.lstat(destination); throw Error(`An item named “${path.basename(source)}” already exists in that folder.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const relocated = target => isWithin(source, target) ? path.join(destination, path.relative(source, target)) : target;
  const openDocuments = new Map(drafts.map(draft => [draft.path, draft.content]));
  const changes = [], documents = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const oldPath = path.join(directory, entry.name), newPath = relocated(oldPath);
      // Move symlinks with the folder, but never follow or rewrite their targets.
      if (entry.isDirectory()) await walk(oldPath);
      else if (entry.isFile() && markdownExtension.test(entry.name)) {
        const original = await fs.readFile(oldPath, 'utf8');
        const savedContent = rebaseReferences(original, oldPath, newPath, relocated);
        if (savedContent !== original) changes.push({ path: newPath, original, content: savedContent, mode: (await fs.stat(oldPath)).mode });
        if (openDocuments.has(oldPath)) documents.push({ oldPath, path: newPath, content: rebaseReferences(openDocuments.get(oldPath), oldPath, newPath, relocated) });
      }
    }
  }
  await walk(source);
  await fs.rename(source, destination);
  const applied = [];
  try {
    for (const change of changes) { await replaceContent(change.path, change.content, change.mode); applied.push(change); }
  } catch (error) {
    for (const change of applied.reverse()) await replaceContent(change.path, change.original, change.mode);
    await fs.rename(destination, source);
    throw error;
  }
  return { path: destination, name: path.basename(destination), documents };
}
async function moveHandout(root, source, parent, content) {
  source = await checkedPath(root, source); parent = await checkedPath(root, parent);
  if (!(await fs.stat(source)).isFile() || !(await fs.stat(parent)).isDirectory()) throw Error('Choose a file and destination folder.');
  const destination = path.join(parent, path.basename(source));
  const markdown = markdownExtension.test(source);
  const original = markdown ? await fs.readFile(source, 'utf8') : undefined;
  if (markdown && typeof content !== 'string') content = original;
  if (source === destination) return { path: source, name: path.basename(source), ...(markdown ? { content, savedContent: original } : {}) };
  const savedContent = markdown ? rebaseReferences(original, source, destination) : undefined;
  if (markdown) await fs.writeFile(destination, savedContent, { flag: 'wx', mode: (await fs.stat(source)).mode });
  else await fs.copyFile(source, destination, require('fs').constants.COPYFILE_EXCL);
  try { await fs.unlink(source); } catch (error) { await fs.unlink(destination); throw error; }
  return { path: destination, name: path.basename(destination), ...(markdown ? { content: rebaseReferences(content, source, destination), savedContent } : {}) };
}
module.exports = { createEntry, moveHandout, moveFolder, rebaseReferences, checkedPath };
