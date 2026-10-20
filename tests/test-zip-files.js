'use strict';
const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { extractArchive } = require('../electron/zipFiles');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-zips-'));
  try {
    const fixtures = path.join(__dirname, 'fixtures/zips');
    for (const name of await fs.readdir(fixtures)) if (name.endsWith('.zip')) await fs.copyFile(path.join(fixtures, name), path.join(root, name));
    const extracted = await extractArchive(root, path.join(root, 'Lesson.zip'));
    assert.equal(extracted.path, path.join(root, 'Lesson'));
    assert.equal(await fs.readFile(path.join(extracted.path, 'nested/Lesson.md'), 'utf8'), '# Lesson');
    assert.equal(await fs.readFile(path.join(extracted.path, 'café.txt'), 'utf8'), 'Unicode');
    const second = await extractArchive(root, path.join(root, 'Lesson.zip'));
    assert.equal(second.name, 'Lesson (2)');
    await extractArchive(root, path.join(root, 'stored.zip'));
    for (const name of ['traversal', 'absolute', 'duplicate', 'symlink', 'conflict', 'corrupt', 'huge']) {
      await assert.rejects(extractArchive(root, path.join(root, name + '.zip')), undefined, name);
      await assert.rejects(fs.access(path.join(root, name)), undefined, 'No partial folder: ' + name);
    }
    await assert.rejects(fs.access(path.join(root, 'escape.txt')));
    await fs.writeFile(path.join(root, 'invalid.zip'), 'not a zip');
    await assert.rejects(extractArchive(root, path.join(root, 'invalid.zip')));
    await assert.rejects(extractArchive(path.join(root, 'Lesson'), path.join(root, 'Lesson.zip')));
    assert.equal(await fs.readFile(path.join(root, 'Lesson/nested/Lesson.md'), 'utf8'), '# Lesson');
    console.log('ZIP extraction tests passed');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
