const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { fileURLToPath } = require('url');
const EDITOR = require('url').pathToFileURL(path.join(__dirname, '../renderer/vector-lab/index.html')).href;
const sessions = new Map();
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function validSession(event) {
  const session = sessions.get(event.sender.id);
  if (!session || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url.split('?')[0] !== EDITOR) throw Error('Unrecognized Vector Lab session.');
  return session;
}
function register({ ipcMain, BrowserWindow, dialog, mainWindow, root, checkedPath }) {
  ipcMain.handle('vector-lab:edit', async (event, url, documentPath = null) => {
    if (event.sender !== mainWindow().webContents) throw Error('Unrecognized editor.');
    const folder = root();
    if (!folder) throw Error('Open a lesson folder first.');
    const creating = !url;
    if(creating){
      if(typeof documentPath!=='string' || !/\.(md|markdown|mdown)$/i.test(documentPath))throw Error('Save your document before drawing an image.');
      documentPath=await checkedPath(folder,documentPath);
    }
    let target;
    try { target = creating ? documentPath : fileURLToPath(url); } catch { throw Error('Choose a local PNG, SVG, or JPG image.'); }
    target = await checkedPath(folder, target);
    const extension = creating ? '.svg' : path.extname(target).toLowerCase();
    if (!['.png','.svg','.jpg','.jpeg'].includes(extension)) throw Error('Vector Lab editing currently supports PNG, SVG, and JPG.');
    const bytes = creating ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"></svg>') : await fs.readFile(target);
    if (bytes.length > 30e6) throw Error('Use an image smaller than 30 MB.');
    const existing = [...sessions.values()].find(session => !creating && session.target === target);
    if (existing) { existing.window.focus(); return; }
    const win = new BrowserWindow({ parent: mainWindow(), width: 1400, height: 950, title: 'Vector Lab — ' + path.basename(target), webPreferences: { preload: path.join(__dirname,'vectorLabPreload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'vector-lab-editor' } });
    const session = { creating, documentPath, window: win, folder, target, bytes, hash: digest(bytes), mime: extension === '.svg' ? 'image/svg+xml' : ['.jpg','.jpeg'].includes(extension) ? 'image/jpeg' : 'image/png', dirty: false, saving: false };
    const contentsId = win.webContents.id;
    sessions.set(contentsId, session);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const name of ['will-navigate','will-redirect']) win.webContents.on(name, (event, url) => { if (url.split('?')[0] !== EDITOR) event.preventDefault(); });
    win.on('close', event => {
      if (session.saving || session.dirty && dialog.showMessageBoxSync(win, { type: 'question', message: 'Discard unsaved image changes?', buttons: ['Keep editing','Discard changes'], defaultId: 0, cancelId: 0 }) === 0) event.preventDefault();
    });
    win.on('closed', () => sessions.delete(contentsId));
    win.webContents.on('did-fail-load', (_event, code, description, _url, main) => { if (main && code !== -3) void dialog.showMessageBox(win,{type:'error',message:'Could not load bundled Vector Lab',detail:description}); });
    await win.loadURL(EDITOR + '?handout=1').catch(()=>{});
  });
  ipcMain.handle('vector-lab:load', event => {
    const session = validSession(event);
    return { version: 1, name: session.creating ? 'New drawing.svg' : path.basename(session.target), creating: session.creating, mime: session.mime, base64: session.bytes.toString('base64') };
  });
  ipcMain.on('vector-lab:dirty', (event, dirty) => { try { validSession(event).dirty = dirty === true; } catch {} });
  ipcMain.handle('vector-lab:save', async (event, data) => {
    const session = validSession(event);
    if (session.saving) throw Error('A save is already in progress.');
    if (data?.version !== 1 || !(data.mime === session.mime || session.mime === 'image/jpeg' && data.mime === 'image/png') || typeof data.base64 !== 'string' || data.base64.length > 45e6 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64)) throw Error('Invalid image returned by Vector Lab.');
    let bytes = Buffer.from(data.base64,'base64');
    const converting = session.mime === 'image/jpeg' && data.mime === 'image/png';
    if (session.mime === 'image/jpeg' && !converting) {
      if (!bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw Error('Invalid edited JPG image.');
      const image = require('electron').nativeImage.createFromBuffer(bytes);
      if (image.isEmpty()) throw Error('Could not encode edited JPG.');
      bytes = image.toJPEG(95);
    }
    if ((session.mime === 'image/png' || converting) && !bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) throw Error('Invalid PNG.');
    if (session.mime === 'image/svg+xml' && (!/<svg[\s>]/i.test(bytes.toString('utf8')) || /<\s*(script|foreignObject)\b|\son\w+\s*=|(?:href\s*=\s*["']\s*(?:https?:|file:|javascript:))/i.test(bytes.toString('utf8')))) throw Error('SVG contains unsupported content.');
    session.saving = true;
    try {
      const oldPath = session.target;
      let destination=oldPath;
      if(session.creating || converting){
        const extension=converting?'png':'svg';
        const chosen=await dialog.showSaveDialog(session.window,{title:session.creating?'Insert drawing':'Save as PNG and update links',defaultPath:session.creating?path.join(path.dirname(session.documentPath),'drawing.svg'):oldPath.replace(/\.jpe?g$/i,'.png'),filters:[{name:extension.toUpperCase(),extensions:[extension]}]});
        if(chosen.canceled || !chosen.filePath)return {saved:false};
        destination=chosen.filePath;
        if(path.extname(destination).toLowerCase()!=='.'+extension)throw Error('Use a .'+extension+' filename.');
        await checkedPath(session.folder,path.dirname(destination));
        try { await fs.lstat(destination);throw Error('That filename already exists. Choose another name.'); } catch(error){if(error.code!=='ENOENT')throw error;}
      }
      if(!session.creating){
        await checkedPath(session.folder, oldPath);
        const current = await fs.readFile(oldPath);
        if (digest(current) !== session.hash) throw Error('This image changed outside Vector Lab. Reopen it before saving.');
        if(!converting){
          const choice = await dialog.showMessageBox(session.window,{type:'question',message:'Save changes to ' + path.basename(oldPath) + '?',detail:'Every slide using this image will update.',buttons:['Save changes','Cancel'],defaultId:0,cancelId:1});
          if (choice.response !== 0) return { saved: false };
        }
      }
      const temp = destination + '.' + crypto.randomUUID() + '.tmp';
      try { await fs.writeFile(temp,bytes,{flag:'wx'}); if(destination!==oldPath || session.creating){await fs.link(temp,destination);}else await fs.rename(temp,destination); } finally { await fs.unlink(temp).catch(()=>{}); }
      const update={oldPath:session.creating?null:oldPath,newPath:destination,documentPath:session.documentPath,insert:session.creating};
      session.target=destination;session.creating=false;if(converting)session.mime='image/png';
      session.bytes=bytes;session.hash=digest(bytes);session.dirty=false;
      mainWindow().webContents.send('vector-lab:saved',update);
      return { saved: true, mime:session.mime, name:path.basename(destination) };
    } finally { session.saving=false; }
  });
}
module.exports = { register };
