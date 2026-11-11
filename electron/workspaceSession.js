'use strict';
const fs = require('fs');
const path = require('path');
const MAX_BYTES = 1024 * 1024;

function normalizeSession(value) {
  const absolute = value => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
  const position = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (!value || value.version !== 1 || value.root !== null && !absolute(value.root) ||
      !Array.isArray(value.documents) || value.documents.length > 200) throw Error('Invalid previous session.');
  const paths = new Set();
  const documents = value.documents.map(document => {
    if (!document || !absolute(document.path) || !/\.(md|markdown|mdown)$/i.test(document.path) || paths.has(document.path) ||
        document.root !== null && !absolute(document.root)) throw Error('Invalid session document.');
    paths.add(document.path);
    return { path: document.path, root: document.root, layout: typeof document.layout === 'string' ? document.layout : 'letter',
      handoutTheme: ['default', 'classic', 'modern', 'spacious'].includes(document.handoutTheme) ? document.handoutTheme : 'default',
      selectionStart: position(document.selectionStart), selectionEnd: position(document.selectionEnd),
      scrollTop: position(document.scrollTop), scrollLeft: position(document.scrollLeft), previewScrollTop: position(document.previewScrollTop) };
  });
  const session = { version: 1, root: value.root, activePath: paths.has(value.activePath) ? value.activePath : null, documents };
  if (Buffer.byteLength(JSON.stringify(session)) > MAX_BYTES) throw Error('Previous session is too large.');
  return session;
}

class WorkspaceSessionStore {
  constructor(directory, io = fs) { this.directory = directory; this.io = io; this.filePath = path.join(directory, 'workspace-session.json'); this.fingerprint = null; }
  load() {
    try {
      const stat = this.io.statSync(this.filePath);
      if (!stat.isFile() || stat.size > MAX_BYTES) throw Error('Previous session is too large or is not a file.');
      const snapshot = normalizeSession(JSON.parse(this.io.readFileSync(this.filePath, 'utf8')));
      this.fingerprint = JSON.stringify(snapshot);
      return { snapshot: snapshot.root || snapshot.documents.length ? snapshot : null };
    } catch (error) {
      if (error.code === 'ENOENT') return { snapshot: null };
      return { snapshot: null, warning: `Could not read the previous session: ${error.message}` };
    }
  }
  save(value) {
    const snapshot = normalizeSession(value), fingerprint = JSON.stringify(snapshot);
    if (fingerprint === this.fingerprint) return;
    this.io.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = this.filePath + `.${process.pid}.tmp`;
    let descriptor;
    try {
      descriptor = this.io.openSync(temporary, 'w', 0o600);
      this.io.writeFileSync(descriptor, fingerprint, 'utf8');
      this.io.fsyncSync(descriptor); this.io.closeSync(descriptor); descriptor = undefined;
      this.io.renameSync(temporary, this.filePath);
    } catch (error) {
      if (descriptor !== undefined) this.io.closeSync(descriptor);
      try { this.io.unlinkSync(temporary); } catch {}
      throw error;
    }
    this.fingerprint = fingerprint;
  }
}

// Read current disk content only after the user accepts the startup offer.
async function restoreSession(snapshot, { readFolder, readDocument, readAssets }) {
  if (!snapshot) return { folder: null, documents: [], activePath: null, skipped: [] };
  const skipped = [], documents = [], assets = new Map();
  let folder = null;
  if (snapshot.root) {
    try { folder = await readFolder(snapshot.root); assets.set(snapshot.root, folder.assets); }
    catch { skipped.push(snapshot.root); }
  }
  for (const document of snapshot.documents) {
    try {
      const content = await readDocument(document.path), root = document.root || path.dirname(document.path);
      if (!assets.has(root)) assets.set(root, await readAssets(root).catch(() => []));
      documents.push({ ...document, root, file: { path: document.path, name: path.basename(document.path), type: 'file', markdown: true },
        content, savedContent: content, dirty: false, assets: assets.get(root),
        selectionStart: Math.min(content.length, document.selectionStart), selectionEnd: Math.min(content.length, document.selectionEnd) });
    } catch { skipped.push(document.path); }
  }
  return { folder, documents, skipped, activePath: documents.find(document => document.file.path === snapshot.activePath)?.file.path || documents[0]?.file.path || null };
}
module.exports = { WorkspaceSessionStore, normalizeSession, restoreSession };
