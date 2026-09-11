'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { downloadRecommendedModel, sha256File } = require('../electron/ai/modelDownload');

(async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'handout-model-test-'));
  try {
    const contents = Buffer.from('small verified model fixture');
    const name = 'fixture.gguf';
    const destination = path.join(folder, name);
    const sha256 = crypto.createHash('sha256').update(contents).digest('hex');
    await fs.writeFile(destination, contents);
    assert.strictEqual(await sha256File(destination), sha256);
    assert.strictEqual(await downloadRecommendedModel(folder, () => {}, undefined, { name, sha256, url: 'https://invalid.test/unused' }), destination);
    console.log('model download verification test: OK');
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
