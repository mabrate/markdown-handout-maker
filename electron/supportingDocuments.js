'use strict';
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const { checkedPath } = require('./fileBrowser');
const { delimited } = require('../renderer/clipboard');
// Office files are ZIPs: bound the expanded size before a parser loads them.
async function checkOfficeArchive(file) {
  await new Promise((resolve, reject) => {
    require('yauzl').open(file, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      let size = 0, count = 0;
      zip.on('error', reject); zip.on('end', resolve);
      zip.on('entry', entry => {
        size += entry.uncompressedSize;
        if (++count > 10000 || size > 64 * 1024 * 1024 || entry.generalPurposeBitFlag & 1) {
          zip.close(); reject(Error('This Office file is encrypted or exceeds the preview limit.')); return;
        }
        zip.readEntry();
      });
      zip.readEntry();
    });
  });
}
async function previewDocument(root, target) {
  const file = await checkedPath(root, target);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024) throw Error('Preview supports files up to 20 MB. Open this file in its default app.');
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return { kind: 'pdf', url: pathToFileURL(file).href };
  if (['.docx', '.xlsx'].includes(ext)) await checkOfficeArchive(file);
  if (ext === '.docx') {
    const result = await require('mammoth').extractRawText({ buffer: await fs.readFile(file) });
    return { kind: 'text', text: result.value.slice(0, 500000), note: 'Text preview; open in Word or Google Docs for original formatting.' };
  }
  if (ext === '.xlsx') {
    const workbook = new (require('exceljs').Workbook)();
    await workbook.xlsx.load(await fs.readFile(file));
    return { kind: 'sheets', sheets: workbook.worksheets.slice(0, 30).map(sheet => ({ name: sheet.name, rows: Array.from({ length: Math.min(sheet.rowCount, 200) }, (_, r) => Array.from({ length: Math.min(sheet.columnCount, 40) }, (_, c) => sheet.getRow(r + 1).getCell(c + 1).text)) })), note: 'Preview shows up to 30 sheets, 200 rows and 40 columns per sheet. Formula results use the values saved by your spreadsheet app.' };
  }
  if (['.csv', '.tsv'].includes(ext)) return { kind: 'sheets', sheets: [{ name: path.basename(file), rows: delimited(await fs.readFile(file, 'utf8'), ext === '.csv' ? ',' : '\t').slice(0, 200).map(row => row.slice(0, 40)) }], note: 'Preview shows up to 200 rows and 40 columns.' };
  if (['.txt', '.json'].includes(ext)) return { kind: 'text', text: (await fs.readFile(file, 'utf8')).slice(0, 500000) };
  return { kind: 'unsupported', note: 'No preview for this format. Use Open in default app.' };
}
module.exports = { previewDocument };
