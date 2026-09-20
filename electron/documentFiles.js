'use strict';

const fs = require('fs/promises');
const path = require('path');
const markdownExtension = /\.(md|markdown|mdown)$/i;

function safeDocumentName(currentPath, requestedName) {
  const requested = String(requestedName || '').trim();
  if (!requested || requested === '.' || requested === '..') throw new Error('Enter a filename.');
  if (path.basename(requested) !== requested || /[\\/]/.test(requested)) throw new Error('Use a filename without folders.');
  const extension = path.extname(requested);
  if (extension && !markdownExtension.test(requested)) throw new Error('Use a Markdown filename (.md, .markdown, or .mdown).');
  return extension ? requested : `${requested}${path.extname(currentPath) || '.md'}`;
}

async function renameDocumentFile(currentPath, requestedName) {
  const name = safeDocumentName(currentPath, requestedName);
  const destination = path.join(path.dirname(currentPath), name);
  if (destination === currentPath) return { path: currentPath, name };
  try { await fs.access(destination); throw new Error(`A file named “${name}” already exists.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.rename(currentPath, destination);
  return { path: destination, name };
}

module.exports = { markdownExtension, safeDocumentName, renameDocumentFile };
