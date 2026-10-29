// Optional native check: PLAYWRIGHT_MODULE can point to an installed Playwright.
const {_electron}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const temp=await fs.mkdtemp('/tmp/handout-vector-native-');let application;
 try {
  const png=Boolean(process.env.VECTOR_LAB_PNG);
  const image=path.join(temp,process.env.VECTOR_LAB_CONVERT?'art.jpg':png?'art.png':'art.svg');
  await fs.writeFile(image,'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><rect width="40" height="30" fill="red"/></svg>');
  if(process.env.VECTOR_LAB_SVG)await fs.copyFile(process.env.VECTOR_LAB_SVG,image);
  if(process.env.VECTOR_LAB_STYLED_SVG)await fs.writeFile(image,'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><style>rect { fill: red }</style><rect width="40" height="30"/></svg>');
  if(png)await fs.copyFile(process.env.VECTOR_LAB_PNG,image);
  await fs.writeFile(path.join(temp,'lesson.md'),'---\ntype: slides\n---\n# Edit artwork\n\n![Art]('+path.basename(image)+')\n');
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  application=await _electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--no-sandbox','--user-data-dir='+path.join(temp,'profile')],env,timeout:20000});
  if(process.env.VECTOR_LAB_CONVERT){const encoded=await application.evaluate(({nativeImage})=>nativeImage.createFromBitmap(Buffer.alloc(40*40*4,255),{width:40,height:40}).toJPEG(95).toString('base64'));await fs.writeFile(image,Buffer.from(encoded,'base64'));}
  const page=await application.firstWindow();await page.waitForLoadState('domcontentloaded');
  await application.evaluate(({dialog,BrowserWindow},temp)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[temp]});dialog.showMessageBox=async()=>({response:0});dialog.showSaveDialog=async()=>({canceled:false,filePath:temp+'/'+(process.env.VECTOR_LAB_CONVERT?'art.png':'drawing.svg')});BrowserWindow.getAllWindows()[0].webContents.send('menu:command',{command:'open-folder'});},temp);
  await page.locator('#file-tree').getByRole('button',{name:'lesson.md',exact:true}).click();
  const windowPromise=application.waitForEvent('window');
  if(process.env.VECTOR_LAB_CREATE)await page.getByRole('button',{name:'Draw image…',exact:true}).click();
  else {
  if(process.env.VECTOR_LAB_PRESENT)await page.getByRole('button',{name:'Present',exact:true}).click();
  const imageSelector=process.env.VECTOR_LAB_PRESENT?'.slide-presentation img':'#preview img';
  await page.locator(imageSelector).click({button:'right'});

  await page.getByRole('button',{name:'Edit in Vector Lab',exact:true}).click();
  }
  const editor=await windowPromise;const errors=[];editor.on('pageerror',error=>errors.push(error.message));
  const save=editor.getByRole('button',{name:process.env.VECTOR_LAB_CREATE?'Insert into document':'Save back to slideshow'});await save.waitFor();
  await editor.waitForFunction(()=>window.handoutVectorLabConnected && [...document.querySelectorAll('button')].some(b=>['Save back to slideshow','Insert into document'].includes(b.textContent)&&!b.disabled));
  if(process.env.VECTOR_LAB_STYLED_SVG || process.env.VECTOR_LAB_SVG)assert.equal(await editor.getByText(/Opened as an image/).count(),0);
  if(process.env.VECTOR_LAB_CONVERT)await editor.getByRole('combobox',{name:'Save image format'}).selectOption('image/png');
  await save.click();await editor.getByText('Saved to slideshow.',{exact:true}).waitFor();
  if(process.env.VECTOR_LAB_CREATE){await page.waitForFunction(()=>document.querySelector('#source').value.includes('drawing.svg'));assert((await fs.readFile(path.join(temp,'drawing.svg'),'utf8')).includes('<svg'));}
  else if(process.env.VECTOR_LAB_CONVERT){await page.waitForFunction(()=>document.querySelector('#source').value.includes('art.png'));assert.equal((await fs.readFile(path.join(temp,'art.png'))).subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal((await fs.readFile(image)).subarray(0,2).toString('hex'),'ffd8');}
  else if(png)assert.equal((await fs.readFile(image)).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  else {const saved=await fs.readFile(image,'utf8');assert(saved.includes('viewBox'));if(process.env.VECTOR_LAB_SVG){assert(saved.includes('MEET YOUR CIRCUIT PARTS'));assert(!saved.includes('<image'));}} 
  assert.deepEqual(errors,[]);
  await editor.close();
  if(process.env.VECTOR_LAB_PRESENT){assert.equal(await page.locator('.slide-presentation').count(),1);await page.keyboard.press('Escape');}
  console.log('Native bundled Vector Lab opens the image from preview and saves back to disk');
 }finally {if(application){await application.evaluate(({app})=>app.exit(0)).catch(()=>{});await application.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
