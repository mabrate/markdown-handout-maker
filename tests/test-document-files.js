'use strict';

const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { safeDocumentName, renameDocumentFile } = require('../electron/documentFiles');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-document-test-'));
  try {
    const original = path.join(root, 'draft.md');
    await fs.writeFile(original, '# Draft');
    assert.strictEqual(safeDocumentName(original, 'science lesson'), 'science lesson.md');
    assert.strictEqual(safeDocumentName(original, 'science.markdown'), 'science.markdown');
    assert.throws(() => safeDocumentName(original, '../outside.md'), /without folders/);
    assert.throws(() => safeDocumentName(original, 'notes.txt'), /Markdown filename/);
    const renamed = await renameDocumentFile(original, 'science lesson');
    assert.strictEqual(renamed.name, 'science lesson.md');
    assert.strictEqual(await fs.readFile(renamed.path, 'utf8'), '# Draft');
    await fs.writeFile(path.join(root, 'existing.md'), '');
    await assert.rejects(() => renameDocumentFile(renamed.path, 'existing.md'), /already exists/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
  console.log('document file test: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
