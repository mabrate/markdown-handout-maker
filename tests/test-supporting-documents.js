'use strict';
const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const Excel = require('exceljs');
const Zip = require('jszip');
const { previewDocument } = require('../electron/supportingDocuments');
const { delimited, table } = require('../renderer/clipboard');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'supporting-docs-'));
  try {
    assert.deepEqual(delimited('Name,Notes\r\n"Ada","one, two"\r\n"Bo","line 1\nline 2"\r\n', ','), [['Name', 'Notes'], ['Ada', 'one, two'], ['Bo', 'line 1\nline 2']]);
    assert.match(table([['Name', 'Value'], ['A|B', '<script>']]), /A\\\|B/);
    assert.ok(!table([['<script>']]).includes('| <script>'));
    const book = new Excel.Workbook(); const sheet = book.addWorksheet('Grades');
    sheet.addRow(['Name', 'Score']); sheet.addRow(['Ada', { formula: '1+2', result: 3 }]);
    book.addWorksheet('Second').addRow(['Another sheet']);
    await book.xlsx.writeFile(path.join(root, 'grades.xlsx'));
    const preview = await previewDocument(root, path.join(root, 'grades.xlsx'));
    assert.equal(preview.sheets.length, 2); assert.deepEqual(preview.sheets[0].rows[1], ['Ada', '3']);
    const zip = new Zip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Lesson notes</w:t></w:r></w:p></w:body></w:document>');
    await fs.writeFile(path.join(root, 'lesson.docx'), await zip.generateAsync({type:'nodebuffer'}));
    assert.match((await previewDocument(root, path.join(root, 'lesson.docx'))).text, /Lesson notes/);
    await fs.writeFile(path.join(root, 'data.csv'), 'Name,Notes\nAda,"one, two"');
    assert.deepEqual((await previewDocument(root, path.join(root, 'data.csv'))).sheets[0].rows[1], ['Ada', 'one, two']);
    await fs.writeFile(path.join(root, 'broken.xlsx'), 'broken');
    await assert.rejects(previewDocument(root, path.join(root, 'broken.xlsx')));
    await assert.rejects(previewDocument(root, path.join(root, '..', 'outside.txt')));
    await fs.symlink('/etc/passwd', path.join(root, 'escape.txt'));
    await assert.rejects(previewDocument(root, path.join(root, 'escape.txt')), /outside/);
    console.log('Supporting document and delimited paste checks passed');
  } finally { await fs.rm(root, {recursive:true, force:true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
