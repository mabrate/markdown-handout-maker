const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const fs = require('fs/promises'); const path = require('path'); const { pathToFileURL } = require('url');
const { getAction, listActions } = require('./ai/aiActions'); const { LocalAIService } = require('./ai/aiService');
const { RECOMMENDED_MODEL, downloadRecommendedModel } = require('./ai/modelDownload');
let mainWindow; let currentRoot = null;
let modelDownloadController = null;
const markdownExtension = /\.(md|markdown|mdown)$/i; const imageExtension = /\.(png|jpe?g|gif|webp|svg)$/i;
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const recentLimit = 12;
async function readSettings() { try { return JSON.parse(await fs.readFile(settingsPath(), 'utf8')); } catch { return {}; } }
async function saveSettings(settings) { await fs.mkdir(app.getPath('userData'), { recursive: true }); await fs.writeFile(settingsPath(), JSON.stringify(settings), 'utf8'); }
function isInsideRoot(filePath) { return currentRoot && (filePath === currentRoot || filePath.startsWith(currentRoot + path.sep)); }
async function readTree(folder) { const entries = await fs.readdir(folder, { withFileTypes: true }); return Promise.all(entries.filter(e => !e.name.startsWith('.')).sort((a,b) => a.name.localeCompare(b.name)).map(async e => { const p = path.join(folder, e.name); return e.isDirectory() ? { type: 'folder', name: e.name, path: p, children: await readTree(p) } : { type: 'file', name: e.name, path: p, markdown: markdownExtension.test(e.name) }; })); }
async function assetsIn(folder, root = folder, output = []) { const entries = await fs.readdir(folder, { withFileTypes: true }); for (const e of entries) { if (e.name.startsWith('.')) continue; const p = path.join(folder, e.name); if (e.isDirectory()) await assetsIn(p, root, output); else if (imageExtension.test(e.name)) output.push({ relative: path.relative(root,p).split(path.sep).join('/'), url: pathToFileURL(p).toString() }); } return output; }
function pdfOptions(layout) { const sizes = { letter:{pageSize:'Letter',landscape:false}, 'letter-landscape':{pageSize:'Letter',landscape:true}, a4:{pageSize:'A4',landscape:false}, 'half-portrait':{pageSize:{width:139700,height:215900},landscape:false}, 'half-landscape':{pageSize:{width:215900,height:139700},landscape:false}, 'half-duplicate-portrait':{pageSize:'Letter',landscape:true}, 'half-duplicate-landscape':{pageSize:'Letter',landscape:false}, booklet:{pageSize:'Tabloid',landscape:true} }; return { printBackground:true, marginsType:1, ...(sizes[layout] || sizes.letter) }; }
function safeDocumentName(title, fallback = 'handout') { const cleaned = String(title || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, ''); return cleaned || fallback; }
const aiService = new LocalAIService({ getModelPath: async () => (await readSettings()).modelPath || '', setModelPath: async modelPath => { const settings = await readSettings(); await saveSettings({ ...settings, modelPath }); } });
function sendMenuCommand(command, payload) { mainWindow?.webContents.send('menu:command', { command, payload }); }
async function refreshApplicationMenu() {
  const settings = await readSettings();
  const recentFiles = [];
  for (const filePath of settings.recentFiles || []) {
    try { if (markdownExtension.test(filePath)) { await fs.access(filePath); recentFiles.push(filePath); } } catch {}
  }
  const layouts = [
    ['Letter', 'letter'], ['Letter landscape', 'letter-landscape'], ['A4', 'a4'], ['Half letter portrait', 'half-portrait'],
    ['Half letter landscape', 'half-landscape'], ['Two portrait half-sheet copies', 'half-duplicate-portrait'],
    ['Two landscape half-sheet copies', 'half-duplicate-landscape'], ['11×17 booklet', 'booklet']
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New Handout', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('new-handout') },
      { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: () => sendMenuCommand('open-file') },
      { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => sendMenuCommand('open-folder') },
      { label: 'Open Recent', submenu: recentFiles.length ? recentFiles.map(filePath => ({ label: path.basename(filePath), toolTip: filePath, click: () => sendMenuCommand('open-recent', filePath) })) : [{ label: 'No recent files', enabled: false }] },
      { type: 'separator' }, { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('save') },
      { type: 'separator' }, { label: 'Export PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => sendMenuCommand('export-pdf') },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => sendMenuCommand('print') },
      { type: 'separator' }, ...(process.platform === 'darwin' ? [{ role: 'close' }] : [{ role: 'quit' }])
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }, { type: 'separator' }, { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => sendMenuCommand('find') }] },
    { label: 'View', submenu: [
      { label: 'Toggle Answers', click: () => sendMenuCommand('toggle-answers') },
      { label: 'Toggle Handout Files Panel', click: () => sendMenuCommand('toggle-panel', 'file') },
      { label: 'Toggle Markdown Editor Panel', click: () => sendMenuCommand('toggle-panel', 'editor') },
      { type: 'separator' }, { label: 'Page Layout', submenu: layouts.map(([label, value]) => ({ label, click: () => sendMenuCommand('set-layout', value) })) },
      { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'reload' }, { role: 'toggleDevTools' }
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Handout Markdown Guide', click: () => sendMenuCommand('open-handout-guide', path.join(__dirname, '..', 'demo', 'HANDOUT_MARKDOWN.md')) }] }
  ]));
}
async function addRecent(filePath) { const settings = await readSettings(); const recentFiles = [filePath, ...(settings.recentFiles || []).filter(item => item !== filePath)].slice(0, recentLimit); await saveSettings({...settings, recentFiles}); await refreshApplicationMenu(); return recentFiles; }
function createWindow() { mainWindow = new BrowserWindow({ width:1540, height:980, minWidth:1040, minHeight:680, resizable:true, minimizable:true, maximizable:true, webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false } }); mainWindow.loadFile(path.join(__dirname,'..','renderer','index.html')); }
app.whenReady().then(async () => { await refreshApplicationMenu(); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); }); app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.handle('folders:open', async () => { const settings = await readSettings(); const result = await dialog.showOpenDialog(mainWindow,{title:'Choose handout folder',defaultPath:settings.lastFolder,properties:['openDirectory']}); if(result.canceled) return null; currentRoot=result.filePaths[0]; await saveSettings({...settings,lastFolder:currentRoot}); return {path:currentRoot,name:path.basename(currentRoot),tree:await readTree(currentRoot),assets:await assetsIn(currentRoot)}; });
ipcMain.handle('files:open-dialog', async () => { const settings = await readSettings(); const result = await dialog.showOpenDialog(mainWindow,{title:'Open Markdown file',defaultPath:settings.lastFolder,properties:['openFile'],filters:[{name:'Markdown',extensions:['md','markdown','mdown']}]}); if(result.canceled) return null; const filePath=result.filePaths[0]; currentRoot=path.dirname(filePath); const recentFiles=await addRecent(filePath); return {path:filePath,name:path.basename(filePath),content:await fs.readFile(filePath,'utf8'),assets:await assetsIn(currentRoot),recentFiles}; });
ipcMain.handle('files:recent', async () => { const settings = await readSettings(); const valid=[]; for (const filePath of settings.recentFiles || []) { try { if (markdownExtension.test(filePath)) { await fs.access(filePath); valid.push({path:filePath,name:path.basename(filePath)}); } } catch {} } return valid; });
ipcMain.handle('files:open-recent', async (_e, filePath) => { if (!markdownExtension.test(filePath)) throw Error('Only Markdown files can be opened.'); const content=await fs.readFile(filePath,'utf8'); currentRoot=path.dirname(filePath); const recentFiles=await addRecent(filePath); return {path:filePath,name:path.basename(filePath),content,assets:await assetsIn(currentRoot),recentFiles}; });
ipcMain.handle('files:read', async (_e,p) => { if(!isInsideRoot(p)||!markdownExtension.test(p)) throw Error('File is outside selected folder.'); await addRecent(p); return fs.readFile(p,'utf8'); }); ipcMain.handle('files:save', async (_e,p,content) => { if(!markdownExtension.test(p)||(!isInsideRoot(p)&&path.dirname(p)!==currentRoot)) throw Error('File is outside selected folder.'); await fs.writeFile(p,content,'utf8'); return true; });
ipcMain.handle('files:new', async () => { if(!currentRoot) return null; const result=await dialog.showSaveDialog(mainWindow,{title:'New handout',defaultPath:path.join(currentRoot,'new-handout.md'),filters:[{name:'Markdown',extensions:['md']}]}); if(result.canceled||!isInsideRoot(result.filePath)) return null; await fs.writeFile(result.filePath,'','utf8'); return result.filePath; });
ipcMain.handle('ai:actions', () => listActions());
ipcMain.handle('ai:status', () => aiService.status());
ipcMain.handle('ai:recommended-model', () => ({ name: RECOMMENDED_MODEL.name }));
ipcMain.handle('ai:download-model', async event => {
  if (modelDownloadController) throw new Error('A model download is already running.');
  modelDownloadController = new AbortController();
  try {
    const modelsFolder = path.join(app.getPath('userData'), 'models');
    const modelPath = await downloadRecommendedModel(modelsFolder, progress => event.sender.send('ai:model-download-progress', progress), modelDownloadController.signal);
    return aiService.selectModel(modelPath);
  } finally { modelDownloadController = null; }
});
ipcMain.handle('ai:cancel-model-download', () => { if (!modelDownloadController) return false; modelDownloadController.abort(); return true; });
ipcMain.handle('ai:prepare', async (_event, actionId, selectedText = '', options = {}) => { if (typeof actionId !== 'string' || typeof selectedText !== 'string' || selectedText.length > 12000 || !options || typeof options !== 'object') throw new Error('Invalid local AI request.'); const action = getAction(actionId); const safeOptions = { questionCount: Math.max(1, Math.min(20, Number(options.questionCount) || 5)), defaultPoints: Math.max(0, Math.min(100, Number(options.defaultPoints) || 1)), aiContext: typeof options.aiContext === 'string' ? options.aiContext.slice(0, 6000) : '', additionalContext: typeof options.additionalContext === 'string' ? options.additionalContext.slice(0, 6000) : '' }; return `${action.buildPrompt(selectedText, safeOptions)}\n/no_think\nUse English only in every JSON string value. The response must be complete JSON. Do not stop before the final closing brace.`; });
ipcMain.handle('ai:select-model', async () => { const result = await dialog.showOpenDialog(mainWindow, { title: 'Choose local GGUF model', properties: ['openFile'], filters: [{ name: 'GGUF model', extensions: ['gguf'] }] }); if (result.canceled) return null; return aiService.selectModel(result.filePaths[0]); });
ipcMain.handle('ai:generate', async (event, actionId, selectedText = '', options = {}) => { if (typeof actionId !== 'string' || typeof selectedText !== 'string' || selectedText.length > 12000 || !options || typeof options !== 'object') throw new Error('Invalid local AI request.'); const action = getAction(actionId); const requestId = typeof options.requestId === 'string' ? options.requestId.slice(0, 100) : ''; const safeOptions = { questionCount: Math.max(1, Math.min(20, Number(options.questionCount) || 5)), defaultPoints: Math.max(0, Math.min(100, Number(options.defaultPoints) || 1)), aiContext: typeof options.aiContext === 'string' ? options.aiContext.slice(0, 6000) : '', additionalContext: typeof options.additionalContext === 'string' ? options.additionalContext.slice(0, 6000) : '', prompt: typeof options.prompt === 'string' ? options.prompt.slice(0, 20000) : '', requestId }; if (!safeOptions.prompt.trim()) throw new Error('Enter a prompt before sending it to AI.'); return aiService.generate(action, selectedText, safeOptions, progress => event.sender.send('ai:progress', requestId, progress)); });
ipcMain.handle('ai:stop', (_event, requestId) => aiService.stop(typeof requestId === 'string' ? requestId.slice(0, 100) : ''));
ipcMain.handle('handout:print', (_e, title) => { mainWindow.setTitle(safeDocumentName(title)); return new Promise(resolve => mainWindow.webContents.print({silent:false,printBackground:true},(success,failureReason) => resolve({success,failureReason}))); }); ipcMain.handle('handout:pdf', async (_e,layout,title) => { const documentName=safeDocumentName(title); const result=await dialog.showSaveDialog(mainWindow,{title:'Export handout PDF',defaultPath:`${documentName}.pdf`,filters:[{name:'PDF',extensions:['pdf']}]}); if(result.canceled) return null; await fs.writeFile(result.filePath,await mainWindow.webContents.printToPDF(pdfOptions(layout))); return result.filePath; });
app.on('before-quit', () => { modelDownloadController?.abort(); aiService.dispose(); });
