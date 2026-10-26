'use strict';
const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const { linkedAssets, planHandoutExport, writeHandoutZip } = require('../electron/handoutExport');
const { extractArchive } = require('../electron/zipFiles');

(async () => {
  const timeout = setTimeout(() => { throw Error('ZIP export tests did not finish'); }, 20000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-export-'));
  try {
    await fs.mkdir(path.join(root, 'lessons'));
    await fs.mkdir(path.join(root, 'images'));
    const documentPath = path.join(root, 'lessons/lesson.md');
    await fs.writeFile(documentPath, '# Saved version');
    const assets = {
      'images/pond (1).svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
      'images/café.png': Buffer.from([0, 1, 2, 255]),
      'lessons/movie.mp4': Buffer.from([12, 34, 56, 78]),
      'lessons/data & notes.pdf': 'PDF bytes',
      'lessons/style.css': 'body {}'
    };
    for (const [name, data] of Object.entries(assets)) await fs.writeFile(path.join(root, name), data);
    await fs.writeFile(path.join(root, 'unrelated.txt'), 'Do not export');
    const content = [
      '---', 'title: Draft', '---', '# Unsaved version', '',
      '![Pond](../images/pond%20(1).svg "A pond")',
      '![Again](../images/pond%20(1).svg)', '',
      '![Café][photo]', '', '[photo]: ../images/caf%C3%A9.png', '',
      '[video:movie.mp4]{width=4in}', '',
      '<a href="data%20&amp;%20notes.pdf#page=2">Notes</a>', '',
      '[Styles](style.css?download=1)', '',
      '[Web](https://example.com) ![Online](https://example.com/image.png)',
      '[Mail](mailto:teacher@example.com) [Section](#section)', '',
      '`![Example](missing-inline.png)`', '',
      '~~~md', '![Example](missing-fenced.png)', '~~~', '',
      '    ![Example](missing-indented.png)', '',
      '<!-- ![Hidden](missing-comment.png) -->', '',
      '[unused]: missing-unused.png', ''
    ].join('\r\n');
    const plan = await planHandoutExport(root, documentPath, content);
    assert.equal(plan.assetCount, 5);
    const destination = path.join(root, 'Lesson.zip');
    await writeHandoutZip(plan, destination);
    const zip = await JSZip.loadAsync(await fs.readFile(destination), { checkCRC32: true });
    assert.deepEqual(Object.keys(zip.files).sort(), ['lessons/lesson.md', ...Object.keys(assets)].sort());
    assert.equal(await zip.file('lessons/lesson.md').async('string'), content, 'Export the editor draft verbatim, including CRLF');
    for (const [name, data] of Object.entries(assets)) assert.deepEqual(await zip.file(name).async('nodebuffer'), Buffer.from(data));
    const extracted = await extractArchive(root, destination);
    assert.equal(await fs.readFile(path.join(extracted.path, 'lessons/lesson.md'), 'utf8'), content);
    assert.equal(await fs.readFile(documentPath, 'utf8'), '# Saved version', 'Export must not save over the original');

    const standalone = await planHandoutExport(root, documentPath, '# No assets');
    assert.deepEqual(standalone.entries.map(entry => entry.name), ['lesson.md']);
    await assert.rejects(writeHandoutZip(plan, documentPath), /does not replace/);
    await assert.rejects(writeHandoutZip(plan, path.join(root, 'lessons/movie.mp4')), /does not replace/);
    await assert.rejects(planHandoutExport(root, documentPath, '![Missing](missing.png)'), /missing\.png/);
    await assert.rejects(planHandoutExport(root, documentPath, '[Folder](../images/)'), /file rather than a folder/);
    await assert.rejects(planHandoutExport(root, documentPath, '[Outside](../../outside.png)'), /outside the open folder/);
    await assert.rejects(planHandoutExport(root, documentPath, '<img src="/absolute.png">'), /relative path/);
    await fs.symlink(os.tmpdir(), path.join(root, 'escape'));
    await assert.rejects(planHandoutExport(root, documentPath, '[Escape](../escape/)'), /outside the open folder/);
    assert.deepEqual(linkedAssets('<video poster="poster.png"><source src=clip.webm></video>\n\n<style>body { background: url("paper.png"); }</style>').sort(), ['clip.webm', 'paper.png', 'poster.png']);

    // A read failure must keep an earlier export intact and remove temporary files.
    const originalZip = await fs.readFile(destination);
    await fs.unlink(path.join(root, 'lessons/movie.mp4'));
    await assert.rejects(writeHandoutZip(plan, destination), /ENOENT/);
    assert.deepEqual(await fs.readFile(destination), originalZip);
    assert.ok(!(await fs.readdir(root)).some(name => name.startsWith('.handout-export-')));
    console.log('Handout ZIP export, linked assets, extraction, and failure recovery tests passed');
  } finally { clearTimeout(timeout); await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
