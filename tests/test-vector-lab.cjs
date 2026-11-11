const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {register}=require('../electron/vectorLab');
const {checkedPath}=require('../electron/fileBrowser');
(async()=>{
 const root=await fs.mkdtemp('/tmp/handout-vector-test-'),target=path.join(root,'image.svg');
 const original='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>';
 await fs.writeFile(target,original);
 const handlers={}, listeners={}, windows=[], notifications=[];
 class Window extends EventEmitter {
  constructor(options){super();this.options=options;this.webContents=new EventEmitter();this.webContents.id=windows.length+10;this.webContents.setWindowOpenHandler=fn=>this.open=fn;windows.push(this);}
  async loadURL(url){this.url=url;this.webContents.mainFrame={url};}
  focus(){this.focused=true;}
  close(){let prevented=false;this.emit('close',{preventDefault(){prevented=true;}});this.closePrevented=prevented;if(!prevented)this.emit('closed');}
 }
 const main={webContents:{send:channel=>notifications.push(channel)}};
 let response=0, closeResponse=0;
 register({ipcMain:{handle:(key,fn)=>handlers[key]=fn,on:(key,fn)=>listeners[key]=fn},BrowserWindow:Window,dialog:{showMessageBox:async()=>({response}),showMessageBoxSync:()=>closeResponse},mainWindow:()=>main,root:()=>root,checkedPath});
 try {
  await handlers['vector-lab:edit']({sender:main.webContents},pathToFileURL(target).href);
  const win=windows[0],event={sender:win.webContents,senderFrame:win.webContents.mainFrame};
  assert(win.url.startsWith('file:'));assert(!win.url.includes('draw.marcabrate.com'));
  assert.equal(win.options.webPreferences.nodeIntegration,false);
  const loaded=handlers['vector-lab:load'](event);assert.equal(Buffer.from(loaded.base64,'base64').toString(),original);
  assert.throws(()=>handlers['vector-lab:load']({...event,senderFrame:{url:'https://example.com'}}));
  const edited=original.replace('width="20"','width="30"');
  const payload={version:1,mime:'image/svg+xml',base64:Buffer.from(edited).toString('base64')};
  const saving=handlers['vector-lab:save'](event,payload);
  assert.equal(handlers['vector-lab:close'](event),false,'Closing is blocked while saving');
  assert((await saving).saved);
  assert.equal(await fs.readFile(target,'utf8'),edited);assert.deepEqual(notifications,['vector-lab:saved']);
  await fs.writeFile(target,original);
  await assert.rejects(handlers['vector-lab:save'](event,payload),/changed outside/);
  await assert.rejects(handlers['vector-lab:save'](event,{...payload,base64:Buffer.from('<svg><script>bad</script></svg>').toString('base64')}),/unsupported/);
  await assert.rejects(handlers['vector-lab:edit']({sender:{}},pathToFileURL(target).href),/Unrecognized/);
  assert.throws(()=>handlers['vector-lab:close']({...event,senderFrame:{url:'https://example.com'}}),/Unrecognized/);
  listeners['vector-lab:dirty'](event,true);
  handlers['vector-lab:close'](event);assert.equal(win.closePrevented,true,'Cancel retains unsaved work when Keep editing is chosen');
  closeResponse=1;handlers['vector-lab:close'](event);assert.equal(win.closePrevented,false);
  assert.equal(await fs.readFile(target,'utf8'),original,'Closing does not save image changes');assert.deepEqual(notifications,['vector-lab:saved']);
  Object.defineProperty(win, 'webContents', { get() { throw Error('Object has been destroyed'); } });
  assert.doesNotThrow(() => win.emit('closed'));
  await handlers['vector-lab:edit']({sender:main.webContents},pathToFileURL(target).href);
  assert.equal(windows.length,2,'Closing removes the session so the same image can reopen');
  console.log('Bundled Vector Lab IPC, local loading, save-back, conflict and sender checks passed');
 }finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
