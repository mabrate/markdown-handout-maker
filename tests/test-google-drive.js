const assert = require('node:assert/strict');
const drive = require('../electron/googleDrive');

function mockDocument(text, revisionId = 'revision-1') {
  return {
    documentId: 'doc123', revisionId,
    body: { content: [{ paragraph: { elements: [{ textRun: { content: `${text}\n` } }] }, endIndex: text.length + 2 }] }
  };
}

(async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://docs.googleapis.com/v1/documents' && options.method === 'POST') return Response.json(mockDocument(''));
    if (String(url).endsWith(':batchUpdate')) return Response.json({ documentId: 'doc123' });
    if (String(url).includes('docs.googleapis.com/v1/documents/doc123')) return Response.json(mockDocument(calls.filter(call => call.url.endsWith(':batchUpdate')).length ? '# Edited on phone\n' : ''));
    if (options.method === 'POST') return Response.json({ id: 'pdf123', name: 'Lesson.pdf' });
    return Response.json({ id: 'doc123', name: 'Lesson', mimeType: drive.DOC_MIME, version: '2' });
  };
  try {
    const markdown = '# Lesson\n\n:::question\nA & B\n';
    assert.equal(drive.plainDocumentText(mockDocument(markdown)).text, markdown);
    assert.equal(drive.plainDocumentText(mockDocument('')).text, '');
    assert.equal(drive.plainDocumentText({ body: { content: [{ sectionBreak: {} }, { paragraph: { elements: [{ textRun: { content: 'plain\n' } }] }, endIndex: 7 }] } }).text, 'plain');
    assert.equal(await drive.createPlainDoc('token', 'Lesson', markdown), 'doc123');
    const firstWrite = JSON.parse(calls[2].options.body);
    assert.deepEqual(firstWrite.requests, [
      { insertText: { location: { index: 1 }, text: markdown } },
      { updateTextStyle: { range: { startIndex: 1, endIndex: markdown.length + 1 }, textStyle: { weightedFontFamily: { fontFamily: drive.PLAIN_TEXT_FONT } }, fields: 'weightedFontFamily' } }
    ]);
    assert.equal(firstWrite.writeControl.requiredRevisionId, 'revision-1');
    await drive.writePlainMarkdown('token', mockDocument('old\n'), 'new\n');
    const replacement = JSON.parse(calls[3].options.body);
    assert.deepEqual(replacement.requests[0], { deleteContentRange: { range: { startIndex: 1, endIndex: 5 } } });
    assert.deepEqual(replacement.requests[1], { insertText: { location: { index: 1 }, text: 'new\n' } });
    assert.deepEqual(replacement.requests[2], { updateTextStyle: { range: { startIndex: 1, endIndex: 5 }, textStyle: { weightedFontFamily: { fontFamily: drive.PLAIN_TEXT_FONT } }, fields: 'weightedFontFamily' } });
    assert.equal(drive.plainDocumentText(await drive.getDocument('token', 'doc123')).text, '# Edited on phone\n');
    assert.equal((await drive.metadata('token', 'doc123')).version, '2');
    await drive.upload('token', { name: 'Lesson.pdf', content: Buffer.from('PDF'), mimeType: drive.PDF_MIME });
    assert.match(calls.at(-1).options.body.toString(), /application\/pdf/);
    console.log('Google Drive request test: OK');
  } finally { global.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
