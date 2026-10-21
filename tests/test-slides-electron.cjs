'use strict';
// Optional native integration check: PLAYWRIGHT_MODULE may select an existing install.
const { _electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const Zip = require('jszip');
(async () => {
 const temp = await fs.mkdtemp(path.join(os.tmpdir(),'handout-native-slides-'));
 const lesson=path.join(temp,'lesson'); await fs.mkdir(lesson);
 for (const file of ['example-slides.md','pond-example.svg']) await fs.copyFile(path.join(__dirname,'../demo',file),path.join(lesson,file));
 await fs.writeFile(path.join(lesson,'handout.md'),'# Ordinary handout\n\nKeep handout behavior.');
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let application, child;
 try {
  application=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--no-sandbox','--user-data-dir='+path.join(temp,'profile')],env,timeout:15000});child=application.process();
  const page=await application.firstWindow();page.setDefaultTimeout(15000);await page.waitForLoadState('domcontentloaded');
  await page.evaluate(()=>{ window.confirm = message => { console.warn(message); return true; }; });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await application.evaluate(({dialog,BrowserWindow},{lesson,temp})=>{
   dialog.showOpenDialog=async()=>({canceled:false,filePaths:[lesson]});
   dialog.showSaveDialog=async(_window,options)=>({canceled:false,filePath:temp+'/'+(options.title==='Export PowerPoint'?'deck.pptx':/PDF/.test(options.title)?'deck.pdf':options.title==='Save slide deck'?'saved-slides.md':'slide-guide.md')});
   BrowserWindow.getAllWindows()[0].webContents.send('menu:command',{command:'open-folder'});
  },{lesson,temp});
  await page.locator('#file-tree').getByRole('button',{name:'example-slides.md',exact:true}).click();await page.locator('.slide-card').first().waitFor();
  assert.equal(await page.locator('#preview .slide-card').count(),1);assert.equal(await page.locator('.slide-outline button').count(),6);
  await page.locator('.slide-outline button').nth(3).click();
  await page.waitForFunction(()=>document.querySelector('#preview img')?.naturalWidth>0);
  await page.locator('.slide-outline button').first().click();
  await application.evaluate(async({Menu})=>{for(let n=0;n<100;n++){if(Menu.getApplicationMenu().items.find(i=>i.label==='File').submenu.items.find(i=>i.label==='Export PowerPoint…').enabled)return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Slide menu did not become active');});
  const menus=await application.evaluate(({Menu})=>{const menu=Menu.getApplicationMenu();return {pptx:menu.items.find(i=>i.label==='File').submenu.items.find(i=>i.label==='Export PowerPoint…').enabled,handout:menu.items.find(i=>i.label==='Snippets').enabled,snippets:menu.items.find(i=>i.label==='Slides').submenu.items.find(i=>i.label==='Snippets').submenu.items.map(i=>i.label)};});
  assert.equal(menus.pptx,true);assert.equal(menus.handout,false);assert.deepEqual(menus.snippets,['Columns','Background','Text','Notes','QR code','Table…','Centered text','Fit text','Checklist','Card grid']);
  await page.screenshot({path:'/tmp/handout-slides-native-preview.png'});
  await page.getByRole('button',{name:'Present',exact:true}).click();await page.locator('.slide-presentation').waitFor();
  await application.evaluate(async({Menu,BrowserWindow})=>{for(let n=0;n<100;n++){if(Menu.getApplicationMenu()===null&&BrowserWindow.getAllWindows()[0].isFullScreen())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Presentation should hide menus and enter full screen');});
  assert.equal(await page.locator('.slide-presentation button,.slide-presentation footer').count(),0);
  await page.evaluate(()=>window.handoutDesktop.setDocumentMode('slides','default'));
  assert.equal(await application.evaluate(({Menu})=>Menu.getApplicationMenu()===null),true);
  await page.screenshot({path:'/tmp/handout-slide-only-presentation.png'});
  await page.keyboard.press('Escape');await page.locator('.slide-presentation').waitFor({state:'detached'});
  await application.evaluate(async({Menu,BrowserWindow})=>{for(let n=0;n<100;n++){if(Menu.getApplicationMenu()&&!BrowserWindow.getAllWindows()[0].isFullScreen())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Exit should restore menus and window state');});
  await page.getByRole('button',{name:'Export PowerPoint…',exact:true}).click();await page.getByText('PowerPoint saved to '+path.join(temp,'deck.pptx'),{exact:true}).waitFor();
  const zip=await Zip.loadAsync(await fs.readFile(path.join(temp,'deck.pptx')));assert.equal(Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).length,6);
  await page.getByRole('button',{name:'Export PDF…',exact:true}).click();await page.getByText('PDF exported',{exact:true}).waitFor();
  const pdf=path.join(temp,'deck.pdf');const info=execFileSync('pdfinfo',[pdf],{encoding:'utf8'});assert.match(info,/Pages:\s+6/);assert.match(info,/Page size:\s+960(?:\.\d+)? x 540/);
  const text=execFileSync('pdftotext',[pdf,'-'],{encoding:'utf8'});assert.match(text,/Observe a pond/);assert.ok(!text.includes('Give students a minute'));
  await fs.copyFile(pdf,'/tmp/handout-slides-native.pdf');await fs.copyFile(path.join(temp,'deck.pptx'),'/tmp/handout-slides-native.pptx');
  await page.locator('#file-tree').getByRole('button',{name:'handout.md',exact:true}).click();await page.locator('.handout-page').first().waitFor();assert.equal(await page.locator('.slide-toolbar').isVisible(),false);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu:command',{command:'new-slides'}));await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button').length===3);
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('menu:command',{command:'save'}));await page.getByText('saved-slides.md saved',{exact:true}).waitFor();assert.match(await fs.readFile(path.join(temp,'saved-slides.md'),'utf8'),/type: slides/);
  await application.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(item=>item.label==='Slides').submenu.items.find(item=>item.label==='Slide Syntax Guide').click());await page.getByRole('textbox',{name:'Guide text'}).waitFor();await page.getByRole('button',{name:'Save as…',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('button')].find(button=>button.textContent==='Save as…').disabled);assert.match(await fs.readFile(path.join(temp,'slide-guide.md'),'utf8'),/## Presenter notes/);
  assert.deepEqual(errors,[]);
  await application.close();console.log('Native slide menus, image preview, editable PPTX, PDF dimensions, notes privacy, source save, and guide save passed');
 } catch (error) { if(application) { console.error('Renderer status:', await application.firstWindow().then(page=>page.locator('#status').innerText()).catch(()=>'')); await application.firstWindow().then(page=>page.screenshot({path:'/tmp/slides-native-failure.png'})).catch(()=>{}); } console.error('Native slide check failed:', error); throw error; } finally {
  if(application&&child?.exitCode===null)await application.evaluate(({app})=>app.exit(1)).catch(()=>{});
  await fs.rm(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
