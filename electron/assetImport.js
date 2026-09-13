'use strict';

const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const maximumImageBytes = 25 * 1024 * 1024;

function imageExtension(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(buffer.subarray(0, 4096).toString('utf8'))) return 'svg';
  return '';
}

function timestamp(date = new Date()) {
  const part = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}${part(date.getSeconds())}`;
}

async function normalAssetFolder(documentPath) {
  return path.dirname(documentPath);
}

async function importImageAsset(documentPath, imageBytes, options = {}) {
  const buffer = Buffer.from(imageBytes);
  if (!buffer.length) throw new Error('The image is empty.');
  if (buffer.length > maximumImageBytes) throw new Error('The image is larger than 25 MB.');
  const extension = imageExtension(buffer);
  if (!extension) throw new Error('The image format is not supported.');

  const destinationFolder = await normalAssetFolder(documentPath);
  const baseName = `image-${timestamp(options.date)}`;
  for (let suffix = 0; suffix < 1000; suffix++) {
    const filename = `${baseName}${suffix ? `-${suffix + 1}` : ''}.${extension}`;
    const destination = path.join(destinationFolder, filename);
    try {
      await fs.writeFile(destination, buffer, { flag: 'wx' });
      return {
        path: destination,
        relative: path.relative(path.dirname(documentPath), destination).split(path.sep).join('/'),
        url: pathToFileURL(destination).toString()
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Could not create a unique filename for the image.');
}

function safeImageName(currentPath, requestedName) {
  let name = String(requestedName || '').trim();
  if (!name || name === '.' || name === '..' || name.startsWith('.') || name.endsWith('.') || /[<>:"|?*\\/\x00-\x1f]/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || path.basename(name) !== name) {
    throw new Error('Enter a filename without folders or special path characters.');
  }
  if (!path.extname(name)) name += path.extname(currentPath).toLowerCase();
  if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) throw new Error('Use a PNG, JPEG, GIF, WebP, or SVG filename.');
  return name;
}

async function renameImageAsset(currentPath, requestedName) {
  const name = safeImageName(currentPath, requestedName);
  const destination = path.join(path.dirname(currentPath), name);
  if (destination === currentPath) return { path: currentPath, name, url: pathToFileURL(currentPath).toString() };
  try {
    await fs.access(destination);
    throw new Error(`An image named ${name} already exists.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.rename(currentPath, destination);
  return { path: destination, name, url: pathToFileURL(destination).toString() };
}

module.exports = { imageExtension, importImageAsset, renameImageAsset, safeImageName, timestamp };
