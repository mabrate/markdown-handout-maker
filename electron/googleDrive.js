const http = require('http');
const crypto = require('crypto');

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DOC_MIME = 'application/vnd.google-apps.document';
const PDF_MIME = 'application/pdf';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DOCS_API = 'https://docs.googleapis.com/v1/documents';

function docUrl(id) { return `https://docs.google.com/document/d/${encodeURIComponent(id)}/edit`; }
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

async function apiRequest(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  if (!response.ok) {
    const body = await response.text();
    let message;
    try { message = JSON.parse(body).error?.message; } catch {}
    throw new Error(`Google Drive ${response.status}: ${message || body.slice(0, 250) || response.statusText}`);
  }
  return response;
}

function multipart(metadata, content, mimeType) {
  const boundary = `handout-${crypto.randomBytes(12).toString('hex')}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n`),
    Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'),
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

async function upload(token, { name, content, mimeType }) {
  const data = multipart({ name }, content, mimeType);
  const response = await apiRequest(`${UPLOAD}?uploadType=multipart&fields=id,name,mimeType,webViewLink,version`, token, { method: 'POST', headers: { 'Content-Type': data.contentType }, body: data.body });
  return response.json();
}

async function metadata(token, id) {
  const response = await apiRequest(`${API}/${encodeURIComponent(id)}?fields=id,name,mimeType,version,trashed`, token);
  const file = await response.json();
  if (file.trashed || file.mimeType !== DOC_MIME) throw new Error('The linked Google Doc is unavailable or is no longer a Google Doc.');
  return file;
}

function plainDocumentText(document) {
  const elements = document.body?.content;
  if (!Array.isArray(elements) || !elements.length) throw new Error('The Google Doc has no readable body.');
  let text = '';
  for (const element of elements) {
    if (!element.paragraph) continue;
    for (const part of element.paragraph.elements || []) {
      if (typeof part.textRun?.content === 'string') text += part.textRun.content;
    }
  }
  if (!text.endsWith('\n')) throw new Error('The Google Doc is missing its final paragraph newline.');
  return { text: text.slice(0, -1), endIndex: elements[elements.length - 1].endIndex };
}

async function getDocument(token, id) {
  const response = await apiRequest(`${DOCS_API}/${encodeURIComponent(id)}`, token);
  return response.json();
}

async function writePlainMarkdown(token, document, content) {
  if (typeof content !== 'string') throw new Error('Markdown content must be text.');
  const current = plainDocumentText(document);
  const requests = [];
  if (current.endIndex > 2) requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: current.endIndex - 1 } } });
  if (content) requests.push({ insertText: { location: { index: 1 }, text: content } });
  if (!requests.length) return;
  const body = { requests, ...(document.revisionId ? { writeControl: { requiredRevisionId: document.revisionId } } : {}) };
  await apiRequest(`${DOCS_API}/${encodeURIComponent(document.documentId)}:batchUpdate`, token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
}

async function createPlainDoc(token, title, content) {
  const response = await apiRequest(DOCS_API, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  const created = await response.json();
  const document = await getDocument(token, created.documentId);
  await writePlainMarkdown(token, document, content);
  return created.documentId;
}

async function authorize(clientId, openExternal, clientSecret = '') {
  if (!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('Enter a Google OAuth Desktop client ID in Google Drive settings.');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(24).toString('hex');
  let server;
  try {
    const result = new Promise((resolve, reject) => {
      server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        if (url.pathname !== '/oauth') { response.writeHead(404).end(); return; }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>Google Drive</title><p>You can close this tab and return to The Markdown Handout Maker.</p>');
        if (url.searchParams.get('state') !== state) reject(new Error('Google sign-in state did not match.'));
        else if (url.searchParams.get('error')) reject(new Error(`Google sign-in: ${url.searchParams.get('error')}`));
        else resolve(url.searchParams.get('code'));
      });
      server.on('error', reject);
    });
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
    const redirectUri = `http://127.0.0.1:${server.address().port}/oauth`;
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' });
    await openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
    const code = await Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('Google sign-in timed out.')), 180000))]);
    if (!code) throw new Error('Google sign-in returned no authorization code.');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) throw new Error(`Google sign-in: ${tokens.error_description || tokens.error || tokenResponse.status}`);
    return tokens;
  } finally { server?.close(); }
}

async function refresh(clientId, refreshToken, clientSecret = '') {
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const tokens = await response.json();
  if (!response.ok) throw new Error(`Google sign-in: ${tokens.error_description || tokens.error || response.status}`);
  return tokens;
}

module.exports = { DOC_MIME, PDF_MIME, authorize, refresh, upload, metadata, getDocument, plainDocumentText, writePlainMarkdown, createPlainDoc, docUrl, digest };
