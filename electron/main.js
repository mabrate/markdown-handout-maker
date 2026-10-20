const { app, BrowserWindow, dialog, ipcMain, Menu, shell, safeStorage } = require('electron');
const fs = require('fs/promises'); const path = require('path'); const { pathToFileURL } = require('url');
const { importImageAsset, renameImageAsset } = require('./assetImport');
const { renameDocumentFile, deleteDocumentFile } = require('./documentFiles');
const drive = require('./googleDrive');
const { createEntry, moveHandout, checkedPath } = require('./fileBrowser');
const { extractArchive } = require('./zipFiles');
let mainWindow; let currentRoot = null;
let googleSession = null;
let editorWrapLines = false;
let editorShowWhitespace = false;
let handoutTheme = 'default';
const markdownExtension = /\.(md|markdown|mdown)$/i; const imageExtension = /\.(png|jpe?g|gif|webp|svg)$/i;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const recentLimit = 12;
const productName = 'The Markdown Handout Maker';
async function readSettings() { try { return JSON.parse(await fs.readFile(settingsPath(), 'utf8')); } catch { return {}; } }
async function saveSettings(settings) { await fs.mkdir(app.getPath('userData'), { recursive: true }); await fs.writeFile(settingsPath(), JSON.stringify(settings), 'utf8'); }
function isInsideRoot(filePath) { return currentRoot && (filePath === currentRoot || filePath.startsWith(currentRoot + path.sep)); }
async function readTree(folder) { const entries = await fs.readdir(folder, { withFileTypes: true }); return Promise.all(entries.filter(e => !e.name.startsWith('.')).sort((a,b) => a.name.localeCompare(b.name)).map(async e => { const p = path.join(folder, e.name); const image = imageExtension.test(e.name); return e.isDirectory() ? { type: 'folder', name: e.name, path: p, children: await readTree(p) } : { type: 'file', name: e.name, path: p, markdown: markdownExtension.test(e.name), image, ...(image ? { url: pathToFileURL(p).toString() } : {}) }; })); }
async function assetsIn(folder, root = folder, output = []) { const entries = await fs.readdir(folder, { withFileTypes: true }); for (const e of entries) { if (e.name.startsWith('.')) continue; const p = path.join(folder, e.name); if (e.isDirectory()) await assetsIn(p, root, output); else if (imageExtension.test(e.name)) output.push({ relative: path.relative(root,p).split(path.sep).join('/'), url: pathToFileURL(p).toString() }); } return output; }
function pdfOptions(layout) { const sizes = { letter:{pageSize:'Letter',landscape:false}, 'letter-landscape':{pageSize:'Letter',landscape:true}, a4:{pageSize:'A4',landscape:false}, 'half-portrait':{pageSize:{width:139700,height:215900},landscape:false}, 'half-landscape':{pageSize:{width:215900,height:139700},landscape:false}, 'half-duplicate-portrait':{pageSize:'Letter',landscape:true}, 'half-duplicate-landscape':{pageSize:'Letter',landscape:false}, 'booklet-letter':{pageSize:'Letter',landscape:true}, booklet:{pageSize:'Tabloid',landscape:true} }; return { printBackground:true, marginsType:1, ...(sizes[layout] || sizes.letter) }; }
function safeDocumentName(title, fallback = 'handout') { const cleaned = String(title || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, ''); return cleaned || fallback; }
function sendMenuCommand(command, payload) { mainWindow?.webContents.send('menu:command', { command, payload }); }
async function refreshApplicationMenu() {
  const settings = await readSettings();
  const recentFiles = [];
  for (const filePath of settings.recentFiles || []) {
    try { if (markdownExtension.test(filePath)) { await fs.access(filePath); recentFiles.push(filePath); } } catch {}
  }
  const recentFolders = [];
  for (const folderPath of settings.recentFolders || []) {
    try { if ((await fs.stat(folderPath)).isDirectory()) recentFolders.push(folderPath); } catch {}
  }
  const recentMenu = [
    ...(recentFolders.length ? [{ label: 'Folders', enabled: false }, ...recentFolders.map(folderPath => ({ label: path.basename(folderPath) || folderPath, toolTip: folderPath, click: () => sendMenuCommand('open-recent-folder', folderPath) }))] : []),
    ...(recentFolders.length && recentFiles.length ? [{ type: 'separator' }] : []),
    ...(recentFiles.length ? [{ label: 'Files', enabled: false }, ...recentFiles.map(filePath => ({ label: path.basename(filePath), toolTip: filePath, click: () => sendMenuCommand('open-recent', filePath) }))] : [])
  ];
  const layouts = [
    ['Letter', 'letter'], ['Letter landscape', 'letter-landscape'], ['A4', 'a4'], ['Half letter portrait', 'half-portrait'],
    ['Half letter landscape', 'half-landscape'], ['Two portrait half-sheet copies', 'half-duplicate-portrait'],
    ['Two landscape half-sheet copies', 'half-duplicate-landscape'], ['8.5×11 booklet', 'booklet-letter'], ['11×17 booklet', 'booklet']
  ];
  const quickSnippet = (label, id, accelerator) => ({ label, ...(accelerator ? { accelerator } : {}), click: () => sendMenuCommand('insert-snippet', id) });
  const snippetDialog = (label, id) => ({ label, click: () => sendMenuCommand('open-snippet-dialog', id) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New Handout', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('new-handout') },
      { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('open-file') },
      { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendMenuCommand('open-folder') },
      { label: 'Open Recent', submenu: recentMenu.length ? recentMenu : [{ label: 'No recent files or folders', enabled: false }] },
      { type: 'separator' }, { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
      { type: 'separator' }, { label: 'Export PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenuCommand('export-pdf') },
      { label: 'Google Drive', submenu: [
        { label: 'Settings and sign in…', click: () => sendMenuCommand('google-settings') },
        { label: 'Export PDF to Drive…', click: () => sendMenuCommand('google-export-pdf') },
        { type: 'separator' },
        { label: 'Sync to a Google Doc…', click: () => sendMenuCommand('google-sync') },
        { label: 'Push to Google Doc', click: () => sendMenuCommand('google-push') },
        { label: 'Pull from Google Doc', click: () => sendMenuCommand('google-pull') },
        { label: 'Google Doc link and QR…', click: () => sendMenuCommand('google-link') }
      ] },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => sendMenuCommand('print') },
      { type: 'separator' }, ...(process.platform === 'darwin' ? [{ role: 'close' }] : [{ role: 'quit' }])
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => sendMenuCommand('find') }] },
    { label: 'Snippets', submenu: [
      { label: 'Basics', submenu: [
        quickSnippet('Handout Boilerplate', 'boilerplate'), { type: 'separator' },
        quickSnippet('Heading', 'heading'), quickSnippet('Checklist', 'checklist'),
        quickSnippet('Answer Lines', 'lines'), quickSnippet('Inline Answer', 'inline-lines'),
        quickSnippet('Drawing Space', 'space'), quickSnippet('Box Space', 'box'), quickSnippet('Dot-grid Space', 'dots')
      ] },
      { label: 'Questions & Assessment', submenu: [
        snippetDialog('Question…', 'question'), snippetDialog('Rubric…', 'rubric'),
        { type: 'separator' }, quickSnippet('Total Points', 'total-points'), quickSnippet('Grade Box', 'grade-box')
      ] },
      { label: 'Layout', submenu: [
        quickSnippet('Image + Text Wrap', 'wrap'), quickSnippet('QR Code', 'qr'), snippetDialog('Columns…', 'columns'),
        snippetDialog('Table…', 'table'), quickSnippet('Page Break', 'pagebreak'), quickSnippet('Style Block', 'style')
      ] }
    ] },
    { label: 'View', submenu: [
      { label: 'Toggle Answers', click: () => sendMenuCommand('toggle-answers') },
      { label: 'Toggle Handout Files Panel', click: () => sendMenuCommand('toggle-panel', 'file') },
      { label: 'Toggle Markdown Editor Panel', click: () => sendMenuCommand('toggle-panel', 'editor') },
      { type: 'separator' },
      { label: 'Wrap Lines', type: 'checkbox', checked: editorWrapLines, click: menuItem => { editorWrapLines = menuItem.checked; sendMenuCommand('wrap-lines', editorWrapLines); } },
      { label: 'Show Whitespace', type: 'checkbox', checked: editorShowWhitespace, click: menuItem => { editorShowWhitespace = menuItem.checked; sendMenuCommand('show-whitespace', editorShowWhitespace); } },
      { type: 'separator' }, { label: 'Page Layout', submenu: layouts.map(([label, value]) => ({ label, click: () => sendMenuCommand('set-layout', value) })) },
      { label: 'Handout Theme', submenu: [
        ['Default', 'default'], ['Classic', 'classic'], ['Modern', 'modern'], ['Spacious', 'spacious']
      ].map(([label, value]) => ({ label, type: 'radio', checked: handoutTheme === value, click: () => { handoutTheme = value; sendMenuCommand('set-theme', value); } })) },
      { type: 'separator' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'reload' }, { role: 'toggleDevTools' }
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Handout Markdown Guide', click: () => sendMenuCommand('open-handout-guide', path.join(__dirname, '..', 'demo', 'HANDOUT_MARKDOWN.md')) }] }
  ]));
}
async function addRecent(filePath) { const settings = await readSettings(); const recentFiles = [filePath, ...(settings.recentFiles || []).filter(item => item !== filePath)].slice(0, recentLimit); await saveSettings({...settings, recentFiles}); await refreshApplicationMenu(); return recentFiles; }
function openExternalLink(url) {
  try {
    if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url);
  } catch {}
}
function createWindow() {
  mainWindow = new BrowserWindow({ title:productName, icon:path.join(__dirname,'..','assets','markdown-handout-maker-icon.png'), width:1540, height:980, minWidth:1040, minHeight:680, resizable:true, minimizable:true, maximizable:true, webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false } });
  const contents = mainWindow.webContents;
  contents.on('will-navigate', (event, url) => {
    if (url === contents.getURL() || url.startsWith(`${contents.getURL().split('#')[0]}#`)) return;
    event.preventDefault();
    openExternalLink(url);
  });
  contents.setWindowOpenHandler(({ url }) => { openExternalLink(url); return { action: 'deny' }; });
  contents.on('did-finish-load', () => sendMenuCommand('set-theme', handoutTheme));
  mainWindow.loadFile(path.join(__dirname,'..','renderer','index.html'));
}
app.setName(productName);
app.whenReady().then(async () => { await refreshApplicationMenu(); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); }); app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
async function openHandoutFolder(folderPath) {
  const tree = await readTree(folderPath);
  const assets = await assetsIn(folderPath);
  const settings = await readSettings();
  const recentFolders = [folderPath, ...(settings.recentFolders || []).filter(p => p !== folderPath)].slice(0, recentLimit);
  await saveSettings({ ...settings, lastFolder: folderPath, recentFolders });
  currentRoot = folderPath;
  await refreshApplicationMenu();
  return { path: folderPath, name: path.basename(folderPath), tree, assets };
}
ipcMain.handle('folders:open', async () => {
  const settings = await readSettings();
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose handout folder', defaultPath: settings.lastFolder, properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled) return null;
  return openHandoutFolder(result.filePaths[0]);
});
ipcMain.handle('folders:open-recent', async (_event, folderPath) => {
  const settings = await readSettings();
  if (typeof folderPath !== 'string' || !(settings.recentFolders || []).includes(folderPath)) throw Error('This folder is not in Open Recent.');
  return openHandoutFolder(folderPath);
});
ipcMain.handle('files:open-dialog', async () => { const settings = await readSettings(); const result = await dialog.showOpenDialog(mainWindow,{title:'Open Markdown file',defaultPath:settings.lastFolder,properties:['openFile'],filters:[{name:'Markdown',extensions:['md','markdown','mdown']}]}); if(result.canceled) return null; const filePath=result.filePaths[0]; if (!isInsideRoot(filePath)) currentRoot=path.dirname(filePath); const recentFiles=await addRecent(filePath); return {root:currentRoot,path:filePath,name:path.basename(filePath),content:await fs.readFile(filePath,'utf8'),assets:await assetsIn(currentRoot),recentFiles}; });
ipcMain.handle('files:recent', async () => { const settings = await readSettings(); const valid=[]; for (const filePath of settings.recentFiles || []) { try { if (markdownExtension.test(filePath)) { await fs.access(filePath); valid.push({path:filePath,name:path.basename(filePath)}); } } catch {} } return valid; });
ipcMain.handle('files:open-recent', async (_e, filePath) => { if (!markdownExtension.test(filePath)) throw Error('Only Markdown files can be opened.'); const content=await fs.readFile(filePath,'utf8'); if (!isInsideRoot(filePath)) currentRoot=path.dirname(filePath); const recentFiles=await addRecent(filePath); return {root:currentRoot,path:filePath,name:path.basename(filePath),content,assets:await assetsIn(currentRoot),recentFiles}; });
ipcMain.handle('files:read', async (_e,p) => { if(!isInsideRoot(p)||!markdownExtension.test(p)) throw Error('File is outside selected folder.'); await addRecent(p); return fs.readFile(p,'utf8'); }); ipcMain.handle('files:save', async (_e,p,content) => { if(!markdownExtension.test(p)||(!isInsideRoot(p)&&path.dirname(p)!==currentRoot)) throw Error('File is outside selected folder.'); await fs.writeFile(p,content,'utf8'); return true; });
ipcMain.handle('files:save-new', async (_event, content) => { const result = await dialog.showSaveDialog(mainWindow, { title: 'Save handout', defaultPath: currentRoot ? path.join(currentRoot, 'new-handout.md') : 'new-handout.md', filters: [{ name: 'Markdown', extensions: ['md'] }] }); if (result.canceled || !result.filePath) return null; const filePath = result.filePath; await fs.writeFile(filePath, content, 'utf8'); if (!isInsideRoot(filePath)) currentRoot = path.dirname(filePath); await addRecent(filePath); return { path: filePath, name: path.basename(filePath), assets: await assetsIn(currentRoot) }; });
ipcMain.handle('files:new', async () => { if(!currentRoot) return null; const result=await dialog.showSaveDialog(mainWindow,{title:'New handout',defaultPath:path.join(currentRoot,'new-handout.md'),filters:[{name:'Markdown',extensions:['md']}]}); if(result.canceled||!isInsideRoot(result.filePath)) return null; await fs.writeFile(result.filePath,'','utf8'); return result.filePath; });
ipcMain.handle('files:rename', async (_event, filePath, requestedName) => {
  if (typeof filePath !== 'string' || !markdownExtension.test(filePath) || !isInsideRoot(filePath)) throw new Error('The selected handout is outside the open folder.');
  const renamed = await renameDocumentFile(filePath, requestedName);
  if (renamed.path !== filePath) {
    const settings = await readSettings();
    if (settings.googleDocs?.[filePath]) {
      settings.googleDocs[renamed.path] = settings.googleDocs[filePath];
      delete settings.googleDocs[filePath];
      await saveSettings(settings);
    }
  }
  return renamed;
});
ipcMain.handle('browser:reveal', async (_event, target) => {
  const checked = await checkedPath(currentRoot, target);
  shell.showItemInFolder(checked);
  return true;
});
ipcMain.handle('browser:open-external', async (_event, target) => {
  const checked = await checkedPath(currentRoot, target);
  const error = await shell.openPath(checked);
  if (error) throw Error(error);
  return true;
});
ipcMain.handle('browser:extract-zip', (_event, target) => extractArchive(currentRoot, target));
ipcMain.handle('browser:create', (_event, parent, name, type) => {
  if (!['file', 'folder'].includes(type)) throw Error('Invalid item type.');
  return createEntry(currentRoot, parent, name, type);
});
ipcMain.handle('browser:move', async (_event, source, parent, content) => {
  const moved = await moveHandout(currentRoot, source, parent, content);
  if (moved.path !== source) {
    const settings = await readSettings();
    if (settings.googleDocs?.[source]) { settings.googleDocs[moved.path] = settings.googleDocs[source]; delete settings.googleDocs[source]; }
    settings.recentFiles = [...new Set((settings.recentFiles || []).map(p => p === source ? moved.path : p))];
    await saveSettings(settings); await refreshApplicationMenu();
  }
  return moved;
});
ipcMain.handle('files:delete', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !markdownExtension.test(filePath) || !isInsideRoot(filePath)) throw new Error('The selected handout is outside the open folder.');
  return deleteDocumentFile(filePath);
});
ipcMain.handle('assets:import-image', async (_event, documentPath, imageBytes) => {
  if (typeof documentPath !== 'string' || !markdownExtension.test(documentPath) || !isInsideRoot(documentPath)) throw new Error('Open a saved Markdown handout before pasting an image.');
  if (!(imageBytes instanceof Uint8Array)) throw new Error('The clipboard did not provide valid image data.');
  return importImageAsset(documentPath, imageBytes);
});
ipcMain.handle('assets:reference', (_event, documentPath, imagePath) => {
  if (typeof documentPath !== 'string' || !markdownExtension.test(documentPath) || !isInsideRoot(documentPath)) throw new Error('Open a saved Markdown handout before inserting an image.');
  if (typeof imagePath !== 'string' || !imageExtension.test(imagePath) || !isInsideRoot(imagePath)) throw new Error('The selected image is outside the open folder.');
  return path.relative(path.dirname(documentPath), imagePath).split(path.sep).join('/');
});
ipcMain.handle('assets:rename-image', async (_event, imagePath, requestedName) => {
  if (typeof imagePath !== 'string' || !imageExtension.test(imagePath) || !isInsideRoot(imagePath)) throw new Error('The selected image is outside the open folder.');
  return renameImageAsset(imagePath, requestedName);
});
ipcMain.handle('folders:refresh', async () => currentRoot ? { path: currentRoot, name: path.basename(currentRoot), tree: await readTree(currentRoot), assets: await assetsIn(currentRoot) } : null);
ipcMain.handle('handout:print', (_e, title) => { mainWindow.setTitle(safeDocumentName(title)); return new Promise(resolve => mainWindow.webContents.print({silent:false,printBackground:true},(success,failureReason) => resolve({success,failureReason}))); }); ipcMain.handle('handout:pdf', async (_e,layout,title) => { const documentName=safeDocumentName(title); const result=await dialog.showSaveDialog(mainWindow,{title:'Export handout PDF',defaultPath:`${documentName}.pdf`,filters:[{name:'PDF',extensions:['pdf']}]}); if(result.canceled) return null; await fs.writeFile(result.filePath,await mainWindow.webContents.printToPDF(pdfOptions(layout))); return result.filePath; });
function validHandoutPath(filePath) {
  if (typeof filePath !== 'string' || !markdownExtension.test(filePath) || !isInsideRoot(filePath)) throw new Error('Open a saved Markdown handout first.');
  return filePath;
}
function secureGoogleStorage() {
  return safeStorage.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
}
function decryptGoogleSetting(value) {
  if (!value || !secureGoogleStorage()) return null;
  try { return safeStorage.decryptString(Buffer.from(value, 'base64')); } catch { return null; }
}
function storedGoogleToken(settings) { return decryptGoogleSetting(settings.googleRefreshToken); }
function googleClientSecret(settings) {
  if (googleSession?.clientId === settings.googleClientId && googleSession.clientSecret) return googleSession.clientSecret;
  return decryptGoogleSetting(settings.googleClientSecret);
}
async function googleAccessToken() {
  const settings = await readSettings();
  if (!settings.googleClientId) throw new Error('Set a Google OAuth Desktop client ID in Google Drive settings.');
  if (googleSession?.clientId === settings.googleClientId && googleSession.expiresAt > Date.now() + 60000) return googleSession.accessToken;
  const refreshToken = (googleSession?.clientId === settings.googleClientId && googleSession.refreshToken) || storedGoogleToken(settings);
  if (!refreshToken) throw new Error('Sign in to Google Drive from the File menu first.');
  const clientSecret = googleClientSecret(settings) || '';
  const tokens = await drive.refresh(settings.googleClientId, refreshToken, clientSecret);
  googleSession = { clientId: settings.googleClientId, clientSecret, refreshToken, accessToken: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
  return googleSession.accessToken;
}
ipcMain.handle('google:settings', async () => { const settings = await readSettings(); return { clientId: settings.googleClientId || '', hasClientSecret: Boolean(googleClientSecret(settings)), signedIn: Boolean(googleSession?.refreshToken || storedGoogleToken(settings)), persistentSignIn: Boolean(storedGoogleToken(settings)) }; });
ipcMain.handle('google:save-client-id', async (_event, clientId, clientSecret = '') => {
  if (typeof clientId !== 'string' || !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId.trim())) throw new Error('Enter a valid Google OAuth Desktop client ID.');
  if (typeof clientSecret !== 'string') throw new Error('Google client secret must be text.');
  const settings = await readSettings();
  const normalizedId = clientId.trim();
  const unchangedId = normalizedId === settings.googleClientId;
  const secret = clientSecret.trim() || (unchangedId ? googleClientSecret(settings) : null);
  googleSession = secret ? { clientId: normalizedId, clientSecret: secret } : null;
  const encryptedSecret = secret && secureGoogleStorage() ? safeStorage.encryptString(secret).toString('base64') : undefined;
  await saveSettings({ ...settings, googleClientId: normalizedId, googleClientSecret: encryptedSecret, googleRefreshToken: unchangedId ? settings.googleRefreshToken : undefined });
  return { secureStorage: Boolean(encryptedSecret) };
});
ipcMain.handle('google:sign-in', async () => {
  const settings = await readSettings();
  const clientSecret = googleClientSecret(settings) || '';
  const tokens = await drive.authorize(settings.googleClientId || '', url => shell.openExternal(url), clientSecret);
  googleSession = { clientId: settings.googleClientId, clientSecret, refreshToken: tokens.refresh_token, accessToken: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
  if (tokens.refresh_token && secureGoogleStorage()) await saveSettings({ ...settings, googleRefreshToken: safeStorage.encryptString(tokens.refresh_token).toString('base64') });
  return { persistentSignIn: Boolean(tokens.refresh_token && secureGoogleStorage()) };
});
ipcMain.handle('google:sign-out', async () => { googleSession = null; const settings = await readSettings(); await saveSettings({ ...settings, googleRefreshToken: undefined }); return true; });
ipcMain.handle('google:export-pdf', async (_event, layout, title) => {
  const token = await googleAccessToken();
  const name = `${safeDocumentName(title)}.pdf`;
  const content = await mainWindow.webContents.printToPDF(pdfOptions(layout));
  const file = await drive.upload(token, { name, content, mimeType: drive.PDF_MIME });
  return { name: file.name, url: file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view` };
});
ipcMain.handle('google:doc-link', async (_event, filePath) => {
  validHandoutPath(filePath);
  const link = (await readSettings()).googleDocs?.[filePath];
  return link ? { url: drive.docUrl(link.id), name: link.name } : null;
});
ipcMain.handle('google:sync', async (_event, filePath, title) => {
  validHandoutPath(filePath);
  const settings = await readSettings();
  if (settings.googleDocs?.[filePath]) throw new Error('This handout is already linked. Use Push or Pull.');
  const token = await googleAccessToken();
  const content = await fs.readFile(filePath, 'utf8');
  const name = safeDocumentName(title);
  const id = await drive.createPlainDoc(token, name, content);
  const file = await drive.metadata(token, id);
  const next = await readSettings();
  next.googleDocs = { ...(next.googleDocs || {}), [filePath]: { id, name, version: file.version, localHash: drive.digest(content), format: 'literal' } };
  await saveSettings(next);
  return { url: drive.docUrl(id), name };
});
ipcMain.handle('google:push', async (_event, filePath) => {
  validHandoutPath(filePath);
  const token = await googleAccessToken();
  const settings = await readSettings();
  const link = settings.googleDocs?.[filePath];
  if (!link) throw new Error('Link this handout with Sync to a Google Doc first.');
  const remote = await drive.metadata(token, link.id);
  if (String(remote.version) !== String(link.version)) throw new Error('The Google Doc changed since the last sync. Pull it before pushing, or review its changes in Google Docs.');
  const content = await fs.readFile(filePath, 'utf8');
  const document = await drive.getDocument(token, link.id);
  await drive.writePlainMarkdown(token, document, content);
  const file = await drive.metadata(token, link.id);
  const next = await readSettings();
  next.googleDocs = { ...(next.googleDocs || {}), [filePath]: { ...link, version: file.version, localHash: drive.digest(content), format: 'literal' } };
  await saveSettings(next);
  return { url: drive.docUrl(link.id), name: link.name };
});
ipcMain.handle('google:pull', async (_event, filePath) => {
  validHandoutPath(filePath);
  const token = await googleAccessToken();
  const settings = await readSettings();
  const link = settings.googleDocs?.[filePath];
  if (!link) throw new Error('Link this handout with Sync to a Google Doc first.');
  if (link.format !== 'literal') throw new Error('This link was made with the older Markdown conversion. Push the local handout first to switch it to plain text.');
  const local = await fs.readFile(filePath, 'utf8');
  const remote = await drive.metadata(token, link.id);
  const document = await drive.getDocument(token, link.id);
  const content = drive.plainDocumentText(document).text;
  const latest = await drive.metadata(token, link.id);
  if (String(remote.version) !== String(latest.version)) throw new Error('The Google Doc changed during pull. Try again.');
  let backupPath = null;
  if (drive.digest(local) !== link.localHash) {
    backupPath = `${filePath.replace(markdownExtension, '')}.before-google-pull-${Date.now()}-${require('crypto').randomBytes(3).toString('hex')}.md`;
    await fs.writeFile(backupPath, local, { encoding: 'utf8', flag: 'wx' });
  }
  await fs.writeFile(filePath, content, 'utf8');
  const next = await readSettings();
  next.googleDocs = { ...(next.googleDocs || {}), [filePath]: { ...link, version: remote.version, localHash: drive.digest(content) } };
  await saveSettings(next);
  return { content, url: drive.docUrl(link.id), name: link.name, backupPath };
});
app.on('before-quit', () => { modelDownloadController?.abort(); aiService.dispose(); });
