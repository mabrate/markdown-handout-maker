'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { RecoveryStore, normalizeSnapshot } = require('../electron/recovery');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'handout-recovery-'));
const draft = (content = '# Unsaved') => ({ version: 1, root: '/lessons', activeId: '/lessons/lesson.md', documents: [
  { id: '/lessons/lesson.md', name: 'lesson.md', path: '/lessons/lesson.md', root: '/lessons', content, savedContent: '# Saved', selectionStart: 5, selectionEnd: 8, scrollTop: 150 },
  { id: '__new__', name: 'new-slides.md', path: null, root: null, content: '---\ntype: slides\n---\n# New', savedContent: null }
] });
try {
  const store = new RecoveryStore(root); assert.equal(store.load().snapshot, null);
  store.save(draft()); const bytes = fs.readFileSync(store.filePath, 'utf8');
  const restarted = new RecoveryStore(root).load().snapshot;
  assert.equal(restarted.documents.length, 2); assert.equal(restarted.documents[0].content, '# Unsaved');
  assert.equal(restarted.activeId, '/lessons/lesson.md'); assert.equal(restarted.documents[0].scrollTop, 150);
  assert.equal(restarted.documents[1].path, null);
  assert.throws(() => store.save({ ...draft(), documents: [{ ...draft().documents[0], content: 7 }] }), /Invalid/);
  assert.equal(fs.readFileSync(store.filePath, 'utf8'), bytes, 'Invalid snapshots cannot overwrite valid drafts');
  assert.throws(() => normalizeSnapshot({ ...draft(), documents: [draft().documents[0], draft().documents[0]] }), /Invalid/);
  assert.throws(() => normalizeSnapshot({ ...draft(), root: 'relative' }), /Invalid/);
  const failingIo = Object.create(fs);
  failingIo.renameSync = () => { const error = Error('Disk full'); error.code = 'ENOSPC'; throw error; };
  assert.throws(() => new RecoveryStore(root, failingIo).save(draft('# Latest')), /Disk full/);
  assert.equal(fs.readFileSync(store.filePath, 'utf8'), bytes, 'An interrupted atomic write keeps the previous recovery');
  store.save(draft('')); assert.equal(new RecoveryStore(root).load().snapshot.documents[0].content, '', 'An unsaved empty document is recoverable');
  store.save({ version: 1, root: null, activeId: null, documents: [] }); assert.equal(fs.existsSync(store.filePath), false);
  fs.writeFileSync(store.filePath, '{broken data');
  const damaged = new RecoveryStore(root), loaded = damaged.load();
  assert.equal(loaded.snapshot, null); assert.match(loaded.warning, /preserved/);
  const preserved = fs.readdirSync(root).find(name => name.includes('.unreadable-'));
  assert.equal(fs.readFileSync(path.join(root, preserved), 'utf8'), '{broken data');
  damaged.save(draft('# New protected draft')); assert.equal(new RecoveryStore(root).load().snapshot.documents[0].content, '# New protected draft');
  console.log('Recovery validates drafts, restores saved and untitled tabs, preserves failed writes and unreadable files, and clears saved/discarded work');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
