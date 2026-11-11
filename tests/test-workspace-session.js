'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkspaceSessionStore, normalizeSession, restoreSession } = require('../electron/workspaceSession');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'handout-session-'));
  try {
    const root = path.join(temp, 'lessons'), other = path.join(temp, 'other');
    fs.mkdirSync(root); fs.mkdirSync(other);
    const first = path.join(root, 'one.md'), second = path.join(other, 'two.markdown'), missing = path.join(root, 'missing.md');
    fs.writeFileSync(first, '# Current disk version'); fs.writeFileSync(second, '# Other folder');
    const snapshot = { version: 1, root, activePath: second,
      documents: [first, second, missing].map(file => ({ path: file, root: path.dirname(file), selectionStart: 3, selectionEnd: 999, scrollTop: 140 })) };
    const store = new WorkspaceSessionStore(temp);
    assert.equal(store.load().snapshot, null);
    store.save(snapshot);
    assert.equal(new WorkspaceSessionStore(temp).load().snapshot.activePath, second);
    assert(!fs.readFileSync(store.filePath, 'utf8').includes('# Current'), 'Only paths and view state are persisted');
    assert.throws(() => store.save({ ...snapshot, documents: [{ path: '../bad.md', root }] }), /Invalid/);
    assert.throws(() => store.save({ ...snapshot, documents: [snapshot.documents[0], snapshot.documents[0]] }), /Invalid/);
    assert.throws(() => normalizeSession({ ...snapshot, root: 'relative' }), /Invalid/);
    const bytes = fs.readFileSync(store.filePath, 'utf8');
    const interrupted = new WorkspaceSessionStore(temp, { ...fs, renameSync() { throw Error('Interrupted write'); } });
    assert.throws(() => interrupted.save({ ...snapshot, activePath: first }), /Interrupted/);
    assert.equal(fs.readFileSync(store.filePath, 'utf8'), bytes, 'Failed replacement keeps the previous session');
    const readFolder = async folder => { await fs.promises.access(folder); return { path: folder, assets: [], tree: [] }; };
    const restored = await restoreSession(normalizeSession(snapshot), {
      readFolder, readDocument: file => fs.promises.readFile(file, 'utf8'), readAssets: async () => []
    });
    assert.equal(restored.documents.length, 2); assert.equal(restored.activePath, second);
    assert.equal(restored.documents[0].content, '# Current disk version');
    assert.equal(restored.documents[0].selectionEnd, restored.documents[0].content.length);
    assert.equal(restored.documents[0].dirty, false); assert.deepEqual(restored.skipped, [missing]);
    const unavailable = await restoreSession(normalizeSession({ ...snapshot, root: path.join(temp, 'gone'), activePath: missing }), {
      readFolder, readDocument: file => fs.promises.readFile(file, 'utf8'), readAssets: async () => []
    });
    assert.equal(unavailable.folder, null); assert.equal(unavailable.activePath, first); assert.equal(unavailable.skipped.length, 2);
    store.save({ version: 1, root, activePath: null, documents: [] });
    assert.equal(new WorkspaceSessionStore(temp).load().snapshot.root, root, 'A folder without saved tabs is restorable');
    store.save({ version: 1, root: null, activePath: null, documents: [] });
    assert.equal(new WorkspaceSessionStore(temp).load().snapshot, null, 'Starting fresh clears the offer');
    fs.writeFileSync(store.filePath, '{broken');
    assert.match(new WorkspaceSessionStore(temp).load().warning, /Could not read/);
    console.log('Workspace persistence, atomic failure, validation, latest disk content, multiple roots, missing items, and fresh start checks passed');
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
