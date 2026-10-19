'use strict';
const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createEntry, moveHandout } = require('../electron/fileBrowser');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-browser-'));
  try {
    const child = await createEntry(root, root, 'Lessons', 'folder');
    const file = await createEntry(root, root, 'Example', 'file');
    assert.equal(file.name, 'Example.md');
    await assert.rejects(createEntry(root, root, 'Example', 'file'));
    await assert.rejects(createEntry(root, root, '../escape', 'folder'));
    await assert.rejects(createEntry(root, os.tmpdir(), 'escape', 'file'));
    await fs.symlink(os.tmpdir(), path.join(root, 'outside'));
    await assert.rejects(createEntry(root, path.join(root, 'outside'), 'escape', 'file'));
    const content = '![a](images/a%20b.png)\n<img src="images/x.png">\n[x](https://example.com)\n[ref]: images/y.png\n`![literal](a.png)`\n![angle](<images/a b.png>)';
    const moved = await moveHandout(root, file.path, child.path, content);
    assert.equal(await fs.readFile(moved.path, 'utf8'), moved.content);
    assert.match(moved.content, /\.\.\/images\/a%20b.png/);
    assert.match(moved.content, /src="\.\.\/images\/x.png"/);
    assert.match(moved.content, /\[ref\]: \.\.\/images\/y.png/);
    assert.ok(moved.content.includes('`![literal](a.png)`'));
    assert.ok(moved.content.includes('https://example.com'));
    await assert.rejects(fs.access(file.path));
    await createEntry(root, root, 'Example', 'file');
    await assert.rejects(moveHandout(root, moved.path, root));
    assert.equal(await fs.readFile(moved.path, 'utf8'), moved.content);
    console.log('File browser filesystem tests passed');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
