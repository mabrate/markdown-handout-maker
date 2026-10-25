'use strict';
const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createEntry, moveHandout, moveFolder } = require('../electron/fileBrowser');
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
    await fs.writeFile(file.path, content);
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
    const binary = Buffer.from([0, 255, 1, 128, 17]);
    for (const name of ['image.png', 'data.xlsx', 'notes.docx', 'document.pdf', 'scores.csv']) {
      const source = path.join(root, name); await fs.writeFile(source, binary);
      const result = await moveHandout(root, source, child.path);
      assert.deepEqual(await fs.readFile(result.path), binary); await assert.rejects(fs.access(source));
      await fs.writeFile(source, 'existing'); await assert.rejects(moveHandout(root, result.path, root), { code: 'EEXIST' });
      assert.deepEqual(await fs.readFile(result.path), binary);
    }
    const draft = path.join(root, 'draft.md'); await fs.writeFile(draft, 'Saved ![image](picture.png)');
    const draftMove = await moveHandout(root, draft, child.path, 'Unsaved ![image](picture.png)');
    assert.match(await fs.readFile(draftMove.path, 'utf8'), /^Saved/);
    assert.match(draftMove.content, /^Unsaved/); assert.match(draftMove.content, /\.\.\/picture.png/);
    const unit = path.join(root, 'Unit'), nested = path.join(unit, 'Nested');
    await fs.mkdir(nested, { recursive: true });
    await fs.mkdir(path.join(unit, 'Empty'));
    await fs.writeFile(path.join(unit, 'picture.png'), binary);
    const lesson = path.join(nested, 'lesson.md');
    const savedLesson = '# Saved\n![local](../picture.png)\n![shared](../../shared.png)\n[video:../clip.webm]\n[video:../../shared.webm]\n[sibling](../other.md#part)\n[web](https://example.com)\n`![literal](../../shared.png)`';
    await fs.writeFile(lesson, savedLesson);
    await fs.writeFile(path.join(unit, '.hidden.md'), '[Shared](../shared.md)');
    await fs.symlink(os.tmpdir(), path.join(unit, 'outside'));
    await fs.symlink(nested, path.join(root, 'nested-alias'));
    await assert.rejects(moveFolder(root, unit, unit), /itself/);
    await assert.rejects(moveFolder(root, unit, nested), /subfolders/);
    await assert.rejects(moveFolder(root, unit, path.join(root, 'nested-alias')), /subfolders/);
    await assert.rejects(moveFolder(root, root, child.path), /root folder/);
    await assert.rejects(moveFolder(root, unit, os.tmpdir()), /outside/);
    assert.equal((await moveFolder(root, unit, root)).path, unit);
    // Reject existing directories (including empty ones), files, and dangling links.
    const collision = path.join(child.path, 'Unit');
    for (const kind of ['folder', 'file', 'symlink']) {
      if (kind === 'folder') await fs.mkdir(collision);
      else if (kind === 'file') await fs.writeFile(collision, 'Do not replace');
      else await fs.symlink(path.join(root, 'missing'), collision);
      await assert.rejects(moveFolder(root, unit, child.path), /already exists/);
      assert.equal(await fs.readFile(lesson, 'utf8'), savedLesson);
      await fs.rm(collision, { recursive: true });
    }
    const folderMove = await moveFolder(root, unit, child.path, [{ path: lesson, content: savedLesson.replace('# Saved', '# Unsaved') }]);
    const newLesson = path.join(child.path, 'Unit/Nested/lesson.md');
    assert.equal(folderMove.path, path.join(child.path, 'Unit'));
    assert.equal(folderMove.documents[0].oldPath, lesson);
    assert.equal(folderMove.documents[0].path, newLesson);
    assert.match(folderMove.documents[0].content, /^# Unsaved/);
    const savedMovedLesson = await fs.readFile(newLesson, 'utf8');
    assert.match(savedMovedLesson, /^# Saved/);
    assert.ok(savedMovedLesson.includes('![local](../picture.png)'));
    assert.ok(savedMovedLesson.includes('![shared](../../../shared.png)'));
    assert.ok(savedMovedLesson.includes('[video:../clip.webm]'));
    assert.ok(savedMovedLesson.includes('[video:../../../shared.webm]'));
    assert.ok(savedMovedLesson.includes('[sibling](../other.md#part)'));
    assert.ok(savedMovedLesson.includes('`![literal](../../shared.png)`'));
    assert.match(await fs.readFile(path.join(folderMove.path, '.hidden.md'), 'utf8'), /\.\.\/\.\.\/shared.md/);
    assert.deepEqual(await fs.readFile(path.join(folderMove.path, 'picture.png')), binary);
    assert.ok((await fs.stat(path.join(folderMove.path, 'Empty'))).isDirectory());
    assert.equal(await fs.readlink(path.join(folderMove.path, 'outside')), os.tmpdir());
    await assert.rejects(fs.access(unit));
    // If updating a handout fails, restore earlier updates and the folder location.
    const retry = path.join(root, 'Retry'); await fs.mkdir(retry);
    for (const name of ['first.md', 'second.md']) await fs.writeFile(path.join(retry, name), '[Shared](../shared.md)');
    const rename = fs.rename; let writes = 0;
    fs.rename = async (from, to) => {
      if (from.endsWith('.tmp') && ++writes === 2) throw Error('Simulated write failure');
      return rename(from, to);
    };
    try { await assert.rejects(moveFolder(root, retry, child.path), /Simulated write failure/); }
    finally { fs.rename = rename; }
    for (const name of ['first.md', 'second.md']) assert.equal(await fs.readFile(path.join(retry, name), 'utf8'), '[Shared](../shared.md)');
    assert.deepEqual((await fs.readdir(retry)).sort(), ['first.md', 'second.md']);
    await assert.rejects(fs.access(path.join(child.path, 'Retry')));
    const alias = path.join(root, 'root-alias'); await fs.symlink(root, alias);
    const aliasDraft = path.join(alias, 'Retry/first.md');
    const aliasMove = await moveFolder(alias, path.join(alias, 'Retry'), path.join(alias, 'Lessons'), [{ path: aliasDraft, content: '# Draft\n[Shared](../shared.md)' }]);
    assert.equal(aliasMove.path, path.join(alias, 'Lessons/Retry'));
    assert.equal(aliasMove.documents[0].oldPath, aliasDraft);
    assert.equal(aliasMove.documents[0].path, path.join(alias, 'Lessons/Retry/first.md'));
    assert.equal(aliasMove.documents[0].content, '# Draft\n[Shared](../../shared.md)');
    console.log('File browser filesystem tests passed');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
