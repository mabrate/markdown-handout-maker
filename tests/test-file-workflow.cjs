'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const { pathToFileURL } = require('url');
const path = require('path');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1400,height:900}}); page.setDefaultTimeout(8000); const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(() => {
   window.actions=[]; window.contents={'/work/a.md':'# A\n\n[Resource](https://example.com/)','/work/b.md':'# B'};
   let nodes = Object.keys(window.contents).map(path=>({type:'file',path,name:path.split('/').pop(),markdown:true}));
   nodes.push({type:'file',path:'/work/photo.png',name:'photo.png',image:true},{type:'file',path:'/work/data.xlsx',name:'data.xlsx'});
   const snapshot=()=>({path:'/work',name:'work',assets:[],tree:[{type:'folder',path:'/work/Lessons',name:'Lessons',children:nodes.filter(n=>n.path.startsWith('/work/Lessons/')).map(n=>({...n}))},...nodes.filter(n=>!n.path.startsWith('/work/Lessons/')).map(n=>({...n}))]});
   window.handoutDesktop={platform:'linux',onMenuCommand:cb=>window.menu=cb,openFolder:async()=>snapshot(),refreshFolder:async()=>snapshot(),readFile:async path=>window.contents[path],
    startFileDrag:path=>window.actions.push(['drag',path]),droppedFilePath:file=>'/work/'+file.name,
    openWebLink:async url=>window.actions.push(['link',url]),
    saveFile:async (path,content)=>{window.actions.push(['save',path]);if(window.failSave)throw Error('Save failed');window.contents[path]=content;},
    moveHandout:async (old,parent,content)=>{const node=nodes.find(n=>n.path===old);node.path=parent+'/'+node.name;window.actions.push(['move',old,node.path]);if(node.markdown){window.contents[node.path]=window.contents[old];delete window.contents[old];}return {path:node.path,name:node.name,content};}
   };
  });
  await page.goto(pathToFileURL(path.join(__dirname,'../renderer/index.html')).href);
  await page.evaluate(()=>window.menu({command:'open-folder'}));
  const tree=page.locator('#file-tree'), editor=page.locator('#source');
  await tree.getByRole('button',{name:'a.md',exact:true}).click();
  const link=page.locator('#preview a'); await link.hover(); assert.match(await link.getAttribute('title'),/Ctrl-click/);
  await link.click(); assert.equal(await page.evaluate(()=>window.actions.filter(a=>a[0]==='link').length),0);
  await link.click({modifiers:['Control']}); assert.deepEqual(await page.evaluate(()=>window.actions.at(-1)),['link','https://example.com/']);
  await editor.fill('# Draft cancel'); await tree.getByRole('button',{name:'b.md',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click(); assert.equal(await editor.inputValue(),'# Draft cancel');
  await tree.getByRole('button',{name:'b.md',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Discard',exact:true}).click(); await page.waitForFunction(()=>document.querySelector('#source').value==='# B');
  await tree.getByRole('button',{name:'a.md',exact:true}).click(); assert.match(await editor.inputValue(),/^# A/);
  await editor.fill('# Saved edit'); await tree.getByRole('button',{name:'b.md',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click(); await page.waitForFunction(()=>document.querySelector('#source').value==='# B');
  assert.equal(await page.evaluate(()=>window.contents['/work/a.md']),'# Saved edit');
  await editor.fill('# Cannot save'); await page.evaluate(()=>window.failSave=true); await tree.getByRole('button',{name:'a.md',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click(); await page.getByText('Could not save: Save failed',{exact:true}).waitFor(); assert.equal(await editor.inputValue(),'# Cannot save');
  await page.evaluate(()=>window.failSave=false);
  await page.getByRole('button',{name:'Close b.md',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click(); assert.equal(await editor.inputValue(),'# Cannot save');
  const destination=tree.locator('summary');
  for(const name of ['photo.png','data.xlsx','b.md']) {
   const data=await page.evaluateHandle(name=>{const d=new DataTransfer();d.items.add(new File(['test'],name));return d;},name);
   await destination.dispatchEvent('dragover',{dataTransfer:data}); assert.match(await destination.getAttribute('class'),/drop-target/);
   await destination.dispatchEvent('drop',{dataTransfer:data});
   await page.waitForFunction(name=>window.actions.some(a=>a[0]==='move'&&a[2]==='/work/Lessons/'+name),name);
   await tree.locator('details .file-entry').filter({hasText:name}).waitFor({state:'attached'});
  }
  assert.equal(await editor.inputValue(),'# Cannot save'); assert.match(await page.locator('.document-tab.active').innerText(),/b.md \*/);
  const moved=tree.locator('[data-file-path="/work/Lessons/b.md"]'); await moved.dispatchEvent('dragstart',{dataTransfer:await page.evaluateHandle(()=>new DataTransfer())}); assert.deepEqual(await page.evaluate(()=>window.actions.at(-1)),['drag','/work/Lessons/b.md']);
  await page.getByRole('button',{name:'Close b.md',exact:true}).click(); await page.getByRole('dialog').getByRole('button',{name:'Discard',exact:true}).click(); await page.getByRole('button',{name:'Close b.md',exact:true}).waitFor({state:'detached'});
  await editor.fill('# Background draft');
  await page.evaluate(()=>window.menu({command:'new-handout'}));
  // An inactive dirty tab must also be protected when changing folders.
  await page.evaluate(()=>{ void window.menu({command:'open-folder'}); });
  await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await editor.inputValue(),'# Background draft');
  assert.deepEqual(errors,[]); console.log('Link hints, Save/Discard/Cancel, and all-file folder drop checks passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
