'use strict';
const fs = require('fs');
const path = require('path');
const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const MAX_BYTES = 64 * 1024 * 1024;

function normalizeSnapshot(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.documents) || value.documents.length > 200) throw Error('Invalid recovery data.');
  const absolute = value => value === null || typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0');
  const position = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const ids = new Set();
  const documents = value.documents.map(document => {
    if (!document || typeof document.id !== 'string' || !document.id || ids.has(document.id) ||
      typeof document.name !== 'string' || !document.name || typeof document.content !== 'string' ||
      Buffer.byteLength(document.content) > MAX_DOCUMENT_BYTES || !absolute(document.path) || !absolute(document.root) || !absolute(document.sourcePath ?? null) ||
      document.path && !/\.(md|markdown|mdown)$/i.test(document.path) ||
      document.savedContent !== null && typeof document.savedContent !== 'string') throw Error('Invalid document recovery data.');
    ids.add(document.id);
    return { id: document.id, name: path.basename(document.name), path: document.path, sourcePath: document.sourcePath ?? null, root: document.root,
      content: document.content, savedContent: document.savedContent,
      layout: typeof document.layout === 'string' ? document.layout : 'letter',
      handoutTheme: ['default', 'classic', 'modern', 'spacious'].includes(document.handoutTheme) ? document.handoutTheme : 'default',
      selectionStart: Math.min(document.content.length, position(document.selectionStart)), selectionEnd: Math.min(document.content.length, position(document.selectionEnd)),
      scrollTop: position(document.scrollTop), scrollLeft: position(document.scrollLeft), previewScrollTop: position(document.previewScrollTop) };
  });
  if (!absolute(value.root)) throw Error('Invalid recovery folder.');
  const snapshot = { version: 1, savedAt: Number.isFinite(value.savedAt) ? value.savedAt : 0, root: value.root,
    activeId: ids.has(value.activeId) ? value.activeId : documents[0]?.id || null, documents };
  if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_BYTES) throw Error('Recovery data is larger than 64 MB. Save some documents to protect the remaining drafts.');
  return snapshot;
}

class RecoveryStore {
  constructor(directory, io = fs) {
    this.directory = directory; this.io = io; this.filePath = path.join(directory, 'unsaved-work.json');
    this.loaded = false; this.snapshot = null; this.warning = null; this.fingerprint = null;
  }
  load() {
    if (this.loaded) return { snapshot: this.snapshot, warning: this.warning, filePath: this.filePath };
    try {
      const stat = this.io.statSync(this.filePath);
      if (!stat.isFile() || stat.size > MAX_BYTES) throw Error('Recovery file is too large or is not a regular file.');
      this.snapshot = normalizeSnapshot(JSON.parse(this.io.readFileSync(this.filePath, 'utf8')));
      this.fingerprint = JSON.stringify({ ...this.snapshot, savedAt: 0 });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        if (error.code && !['EISDIR'].includes(error.code)) throw error;
        const preserved = this.filePath + `.unreadable-${Date.now()}`;
        this.io.renameSync(this.filePath, preserved);
        this.warning = `Previous recovery data could not be read. It has been preserved at ${preserved}.`;
      }
    }
    this.loaded = true;
    return { snapshot: this.snapshot, warning: this.warning, filePath: this.filePath };
  }
  save(value) {
    const snapshot = normalizeSnapshot(value);
    this.load();
    const fingerprint = JSON.stringify({ ...snapshot, savedAt: 0 });
    if (fingerprint === this.fingerprint) return { savedAt: this.snapshot?.savedAt || null };
    if (!snapshot.documents.length) {
      try { this.io.unlinkSync(this.filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      this.snapshot = null; this.fingerprint = fingerprint;
      return { savedAt: null };
    }
    snapshot.savedAt = Date.now();
    this.io.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = this.filePath + `.${process.pid}.tmp`;
    let descriptor;
    try {
      descriptor = this.io.openSync(temporary, 'w', 0o600);
      this.io.writeFileSync(descriptor, JSON.stringify(snapshot), 'utf8');
      this.io.fsyncSync(descriptor); this.io.closeSync(descriptor); descriptor = undefined;
      this.io.renameSync(temporary, this.filePath);
    } catch (error) {
      if (descriptor !== undefined) this.io.closeSync(descriptor);
      try { this.io.unlinkSync(temporary); } catch {}
      throw error;
    }
    this.snapshot = snapshot; this.fingerprint = fingerprint;
    return { savedAt: snapshot.savedAt };
  }
}
module.exports = { RecoveryStore, normalizeSnapshot };
