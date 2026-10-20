'use strict';
const fs = require('fs/promises');
const { createWriteStream } = require('fs');
const path = require('path');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');
const { checkedPath } = require('./fileBrowser');
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 10000;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function entryPath(entry) {
  const name = entry.fileName;
  if (!name || /[\\\x00-\x1f]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name)) throw Error('ZIP contains an unsafe path.');
  const parts = name.replace(/\/$/, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[:]/.test(part))) throw Error('ZIP contains an unsafe path.');
  const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
  if (kind && kind !== 0x8000 && kind !== 0x4000) throw Error('ZIP links and special files are not supported.');
  if (entry.generalPurposeBitFlag & 1) throw Error('Password-protected ZIP files are not supported.');
  if (![0, 8].includes(entry.compressionMethod)) throw Error('This ZIP compression format is not supported.');
  return parts;
}
async function extractArchive(root, archivePath) {
  archivePath = await checkedPath(root, archivePath);
  const stat = await fs.stat(archivePath);
  if (!/\.zip$/i.test(archivePath) || !stat.isFile()) throw Error('Choose a ZIP file.');
  if (stat.size > MAX_BYTES) throw Error('ZIP files must be smaller than 512 MB.');
  const zip = await new Promise((resolve, reject) => yauzl.open(archivePath, { lazyEntries: true, autoClose: false, strictFileNames: true }, (error, zip) => error ? reject(error) : resolve(zip)));
  let destination;
  let zipError;
  const onError = error => { zipError = error; };
  zip.on('error', onError);
  try {
    const entries = await new Promise((resolve, reject) => {
      const entries = []; let total = 0; const seen = new Set();
      zip.once('error', reject);
      zip.on('entry', entry => {
        try {
          const parts = entryPath(entry);
          const key = parts.join('/').normalize('NFC').toLowerCase();
          if (seen.has(key)) throw Error('ZIP contains duplicate filenames.');
          seen.add(key);
          total += entry.uncompressedSize;
          if (!Number.isSafeInteger(total) || total > MAX_BYTES || entries.length >= MAX_ENTRIES) throw Error('ZIP exceeds the extraction limit (512 MB or 10,000 entries).');
          entries.push({ entry, parts }); zip.readEntry();
        } catch (error) { reject(error); }
      });
      zip.once('end', () => resolve(entries)); zip.readEntry();
    });
    if (zipError) throw zipError;
    // Reserve a fresh destination only after validating the entire directory.
    const base = path.basename(archivePath).replace(/\.zip$/i, '').replace(/^\.+/, '').trim() || 'Archive';
    for (let number = 1; ; number++) {
      const candidate = path.join(path.dirname(archivePath), number === 1 ? base : `${base} (${number})`);
      try { await fs.mkdir(candidate); destination = candidate; break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    for (const { entry, parts } of entries) {
      if (zipError) throw zipError;
      const output = path.join(destination, ...parts);
      if (entry.fileName.endsWith('/')) { await fs.mkdir(output, { recursive: true }); continue; }
      await fs.mkdir(path.dirname(output), { recursive: true });
      const input = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)));
      let bytes = 0; let crc = 0xffffffff;
      const verify = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > entry.uncompressedSize || bytes > MAX_BYTES) return callback(Error('ZIP entry exceeds its declared size.'));
        for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
        callback(null, chunk);
      } });
      await pipeline(input, verify, createWriteStream(output, { flags: 'wx', mode: 0o644 }));
      if (bytes !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw Error('ZIP file is damaged (checksum mismatch).');
    }
    if (zipError) throw zipError;
    return { path: destination, name: path.basename(destination) };
  } catch (error) {
    if (destination) await fs.rm(destination, { recursive: true, force: true });
    throw error;
  } finally { zip.close(); }
}
module.exports = { extractArchive };
