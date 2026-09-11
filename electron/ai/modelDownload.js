'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const https = require('https');
const path = require('path');

const RECOMMENDED_MODEL = Object.freeze({
  name: 'Qwen_Qwen3.5-4B-Q4_K_M.gguf',
  url: 'https://huggingface.co/bartowski/Qwen_Qwen3.5-4B-GGUF/resolve/main/Qwen_Qwen3.5-4B-Q4_K_M.gguf?download=true',
  sha256: '13c16f426047e2de38cd075bdade4a7bcbc8c774384876f677740cda65f8a983'
});

function downloadResponse(url, options, redirects = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, options, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirects >= 8) return reject(new Error('Too many download redirects.'));
        return resolve(downloadResponse(new URL(response.headers.location, url), options, redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Model download failed with HTTP ${response.statusCode}.`));
      }
      resolve(response);
    });
    request.on('error', reject);
    options.signal?.addEventListener('abort', () => request.destroy(new Error('Model download cancelled.')), { once: true });
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadRecommendedModel(destinationFolder, onProgress = () => {}, signal, model = RECOMMENDED_MODEL) {
  await fsp.mkdir(destinationFolder, { recursive: true });
  const destination = path.join(destinationFolder, model.name);
  const partial = `${destination}.partial`;
  try {
    try {
      if (await sha256File(destination) === model.sha256) return destination;
    } catch {}
    await fsp.rm(partial, { force: true });
    const response = await downloadResponse(model.url, { signal });
    const total = Number(response.headers['content-length']) || 0;
    let received = 0;
    const hash = crypto.createHash('sha256');
    const output = fs.createWriteStream(partial, { flags: 'wx' });
    await new Promise((resolve, reject) => {
      const fail = error => { response.destroy(); output.destroy(); reject(error); };
      response.on('data', chunk => {
        received += chunk.length;
        hash.update(chunk);
        onProgress({ received, total, percent: total ? Math.round(received / total * 100) : null });
      });
      response.on('error', fail);
      output.on('error', fail);
      output.on('finish', resolve);
      response.pipe(output);
    });
    if (signal?.aborted) throw new Error('Model download cancelled.');
    if (hash.digest('hex') !== model.sha256) throw new Error('Downloaded model failed its SHA-256 integrity check.');
    await fsp.rename(partial, destination);
    return destination;
  } catch (error) {
    await fsp.rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { RECOMMENDED_MODEL, downloadRecommendedModel, sha256File };
