'use strict';
const fs = require('fs/promises');
const { createReadStream, createWriteStream } = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { randomUUID } = require('crypto');
const JSZip = require('jszip');
const markdown = require('../renderer/vendor/markdown-it.min.js')({ html: true });
const { checkedPath } = require('./fileBrowser');
const { markdownExtension } = require('./documentFiles');

function linkedAssets(content) {
  const references = new Set();
  function htmlReferences(html) {
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    for (const tag of html.matchAll(/<[a-z][^>]*>/gi)) {
      for (const attribute of tag[0].matchAll(/\b(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        references.add(markdown.utils.unescapeAll(attribute[1] ?? attribute[2] ?? attribute[3]));
      }
    }
    for (const url of html.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)) {
      references.add(markdown.utils.unescapeAll(url[1] ?? url[2] ?? url[3]));
    }
  }
  function visit(tokens) {
    for (const token of tokens) {
      if (token.type === 'image') references.add(token.attrGet('src'));
      if (token.type === 'link_open') references.add(token.attrGet('href'));
      if (token.type === 'html_inline' || token.type === 'html_block') htmlReferences(token.content);
      if (token.type === 'text') {
        for (const video of token.content.matchAll(/\[video:([^\]\r\n]+)\]/gi)) references.add(video[1].trim());
      }
      if (token.children) visit(token.children);
    }
  }
  // Metadata, examples, and comments are not linked document assets.
  content = content.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
  visit(markdown.parse(content.replace(/<!--[\s\S]*?-->/g, ''), {}));
  return [...references].filter(Boolean);
}

function inside(parent, target) {
  const relative = path.relative(parent, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function planHandoutExport(root, documentPath, content) {
  if (typeof content !== 'string' || typeof documentPath !== 'string' || !markdownExtension.test(documentPath)) throw Error('Open a saved Markdown handout first.');
  await checkedPath(root, documentPath);
  const files = new Map([[path.resolve(documentPath), { content }]]);
  let total = Buffer.byteLength(content);
  for (const reference of linkedAssets(content)) {
    if (/^(?:#|\?|\/\/|[a-z][a-z\d+.-]*:)/i.test(reference) && !/^file:/i.test(reference)) continue;
    let decoded;
    try { decoded = decodeURIComponent(reference.split(/[?#]/)[0]); }
    catch { throw Error(`Invalid asset filename: ${reference}`); }
    if (!decoded) continue;
    if (/^(?:file:|[a-z]:|\/|\\)/i.test(decoded) || /[\\\x00-\x1f]/.test(decoded)) throw Error(`Use a relative path for linked asset: ${reference}`);
    const target = path.resolve(path.dirname(documentPath), decoded);
    if (files.has(target)) continue;
    let real, stat;
    try {
      // Check both the written path and its symlink target against the lesson folder.
      if (!inside(path.resolve(root), target)) throw Error('The item is outside the open folder.');
      real = await checkedPath(root, target);
      stat = await fs.stat(real);
      if (!stat.isFile()) throw Error('Link to a file rather than a folder.');
    } catch (error) { throw Error(`Cannot include linked asset “${reference}”: ${error.message}`); }
    total += stat.size;
    files.set(target, { source: real });
  }
  if (total > 512 * 1024 * 1024 || files.size > 10000) throw Error('ZIP export is limited to 512 MB and 10,000 files.');
  // Include only the common folder needed by these links. Parent-relative links
  // retain their structure without changing the author's Markdown.
  let base = path.dirname(path.resolve(documentPath));
  for (const target of files.keys()) while (!inside(base, target)) base = path.dirname(base);
  const names = new Set();
  const entries = [...files].map(([target, file]) => {
    const name = path.relative(base, target).split(path.sep).join('/');
    const key = name.normalize('NFC').toLowerCase();
    if (names.has(key) || name.split('/').some(part => /[<>:"\\|?*\x00-\x1f]/.test(part))) throw Error(`This filename cannot be safely exported: ${name}`);
    names.add(key);
    return { name, ...file };
  });
  return { entries, documentPath, assetCount: entries.length - 1 };
}

async function writeHandoutZip(plan, destination) {
  const output = path.resolve(destination);
  // A native Save dialog can select an existing file: never replace an input.
  const realOutput = await fs.realpath(output).catch(error => { if (error.code !== 'ENOENT') throw error; return output; });
  if (realOutput === await fs.realpath(plan.documentPath) || plan.entries.some(entry => entry.source === realOutput)) throw Error('Choose a ZIP filename that does not replace the handout or a linked asset.');
  const zip = new JSZip();
  const streams = [];
  const temporary = path.join(path.dirname(output), `.handout-export-${randomUUID()}.tmp`);
  try {
    for (const entry of plan.entries) {
      const input = entry.source ? createReadStream(entry.source) : entry.content;
      if (entry.source) streams.push(input);
      zip.file(entry.name, input, { createFolders: false });
    }
    const archive = zip.generateNodeStream({ streamFiles: true, compression: 'DEFLATE' });
    // Also forward errors from queued inputs that JSZip has not resumed yet.
    for (const stream of streams) stream.on('error', error => archive.destroy(error));
    await pipeline(archive, createWriteStream(temporary, { flags: 'wx' }));
    await fs.rename(temporary, output);
    return output;
  } finally {
    for (const stream of streams) stream.destroy();
    await fs.rm(temporary, { force: true });
  }
}

module.exports = { linkedAssets, planHandoutExport, writeHandoutZip };
