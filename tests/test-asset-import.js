'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { imageExtension, importImageAsset, renameImageAsset, safeImageName } = require('../electron/assetImport');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-asset-test-'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
  const date = new Date(2026, 8, 12, 10, 15, 23);
  try {
    const documentPath = path.join(root, 'handout.md');
    await fs.writeFile(documentPath, '# Test');
    assert.strictEqual(imageExtension(png), 'png');
    assert.strictEqual(imageExtension(svg), 'svg');
    assert.strictEqual(imageExtension(Buffer.from('not an image')), '');

    const first = await importImageAsset(documentPath, png, { date });
    assert.strictEqual(first.relative, 'image-2026-09-12-101523.png');
    assert.strictEqual(first.path, path.join(root, first.relative));
    assert.deepStrictEqual(await fs.readFile(path.join(root, first.relative)), png);
    const second = await importImageAsset(documentPath, png, { date });
    assert.strictEqual(second.relative, 'image-2026-09-12-101523-2.png');

    assert.strictEqual(safeImageName(first.path, 'pond diagram'), 'pond diagram.png');
    assert.throws(() => safeImageName(first.path, '../outside.png'), /without folders/);
    assert.throws(() => safeImageName(first.path, 'bad:name.png'), /without folders/);
    assert.throws(() => safeImageName(first.path, 'notes.txt'), /PNG, JPEG/);
    const renamed = await renameImageAsset(first.path, 'pond diagram');
    assert.strictEqual(renamed.name, 'pond diagram.png');
    assert.deepStrictEqual(await fs.readFile(renamed.path), png);
    await assert.rejects(() => renameImageAsset(second.path, renamed.name), /already exists/);


    await assert.rejects(() => importImageAsset(documentPath, Buffer.from('bad')), /not supported/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log('image asset import test: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
