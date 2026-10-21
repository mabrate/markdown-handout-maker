'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1550,height:1000}}); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror',error=>errors.push(error.message));
  const source = '---\ntype: slides\naspect: 16:9\n---\n:::background position=right overlay=dark opacity=35\n![Pond](pond-example.svg)\n:::\n\n:::text x=10% y=65% width=80% size=54 color=white\n**Garden Observations**\n:::\n\n:::notes\nPrivate reminders\n:::\n\n---\n:::background position=top overlay=light opacity=20\n![Pond](pond-example.svg)\n:::\n';
  await page.addInitScript(({source,image})=>{
   window.actions=[]; const snapshot=()=>({path:'/work',name:'work',assets:[{relative:'pond-example.svg',url:image}],tree:[{type:'file',markdown:true,path:'/work/poster.md',name:'poster.md'}]});
   window.handoutDesktop={platform:'linux',onMenuCommand:callback=>window.menu=callback,openFolder:async()=>snapshot(),refreshFolder:async()=>snapshot(),readFile:async()=>source,saveFile:async()=>{},setDocumentMode:async()=>{},setPresentation:async active=>window.actions.push(['presentation',active]),
    exportPowerPoint:async content=>{window.actions.push(['pptx',content,document.querySelectorAll('.slide-print-deck .slide-card').length]);return '/tmp/backgrounds.pptx';},
    exportPdf:async layout=>{window.actions.push(['pdf',layout,document.querySelectorAll('.slide-print-deck .slide-background').length,document.querySelectorAll('.slide-print-deck .slide-text-tools').length,document.querySelectorAll('.slide-print-deck .slide-notes').length]);return '/tmp/backgrounds.pdf';}};
  },{source,image:pathToFileURL(path.join(__dirname,'../demo/pond-example.svg')).href});
  await page.goto(pathToFileURL(path.join(__dirname,'../renderer/index.html')).href);await page.evaluate(()=>window.menu({command:'open-folder'}));await page.getByRole('button',{name:'poster.md',exact:true}).click();
  const text=page.locator('#preview .slide-positioned-text'), background=page.locator('#preview .slide-background');await text.waitFor();await page.waitForFunction(()=>document.querySelector('#preview img')?.naturalWidth>0);
  assert.equal(await background.evaluate(el=>el.style.objectFit),'cover');assert.equal(await background.evaluate(el=>el.style.objectPosition),'100% 50%');assert.equal(await page.locator('#preview .slide-background-overlay').evaluate(el=>el.style.opacity),'0.35');
  assert.equal(await text.evaluate(el=>el.style.fontSize),'72px');assert.equal(await text.evaluate(el=>el.style.color),'rgb(255, 255, 255)');assert.equal(await page.locator('#preview .slide-text').count(),1);
  await text.click();assert.equal(await page.locator('#source').evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),'**Garden Observations**');
  const move=page.getByRole('button',{name:'Move text',exact:true}), resize=page.getByRole('button',{name:'Resize text width',exact:true});await move.waitFor();
  async function drag(handle,dx,dy,cancel=false){const box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:8});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();}
  await page.screenshot({path:'/tmp/slides-background-controls.png'});
  await drag(move,50,-40);await page.waitForFunction(original=>document.querySelector('#source').value!==original,source);await page.waitForTimeout(250);
  const moved=await page.locator('#source').inputValue();assert.ok(moved.endsWith(source.slice(source.indexOf('\n---\n:::background position=top'))));
  const movedSettings=await page.evaluate(()=>window.HandoutSlides.parse(document.querySelector('#source').value).slides[0].blocks.find(block=>block.type==='positioned-text'));assert.ok(movedSettings.x>10);assert.ok(movedSettings.y<65);assert.equal(movedSettings.width,80);
  await page.locator('#source').focus();await page.keyboard.press('Control+z');assert.equal(await page.locator('#source').inputValue(),source);await page.waitForTimeout(250);
  await text.click();await drag(move,35,20,true);assert.equal(await page.locator('#source').inputValue(),source,'Escape cancels a drag without a source edit');
  await drag(resize,-100,0);await page.waitForFunction(original=>document.querySelector('#source').value!==original,source);await page.waitForTimeout(250);
  const resized=await page.evaluate(()=>window.HandoutSlides.parse(document.querySelector('#source').value).slides[0].blocks.find(block=>block.type==='positioned-text'));assert.ok(resized.width<80);assert.equal(resized.x,10);assert.equal(resized.y,65);
  await page.locator('#source').focus();await page.keyboard.press('Control+z');assert.equal(await page.locator('#source').inputValue(),source);await page.waitForTimeout(250);
  await page.screenshot({path:'/tmp/slides-background-preview.png'});
  await page.getByRole('button',{name:'Present',exact:true}).click();const presenting=page.locator('.slide-presentation');await presenting.waitFor();assert.equal(await presenting.locator('.slide-text-tools,button').count(),0);assert.equal(await presenting.locator('.slide-background').count(),1);assert.match(await presenting.innerText(),/Garden Observations/);assert.ok(!(await presenting.innerText()).includes('Private reminders'));
  await page.screenshot({path:'/tmp/slides-background-presentation.png'});await page.keyboard.press('ArrowRight');assert.equal(await presenting.locator('.slide-text').count(),0,'Image-only slides have no text or slide number');await page.keyboard.press('Escape');await presenting.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Export PowerPoint…',exact:true}).click();await page.waitForFunction(()=>window.actions.some(action=>action[0]==='pptx'));assert.equal(await page.evaluate(()=>window.actions.find(action=>action[0]==='pptx')[2]),2);
  await page.getByRole('button',{name:'Export PDF…',exact:true}).click();await page.waitForFunction(()=>window.actions.some(action=>action[0]==='pdf'));assert.deepEqual(await page.evaluate(()=>window.actions.find(action=>action[0]==='pdf')),['pdf','slides-wide',2,0,0]);
  await page.evaluate(()=>{window.printTask=slideStudio.withAllSlides(()=>new Promise(resolve=>window.releasePrint=resolve));});await page.waitForFunction(()=>typeof window.releasePrint==='function');
  await page.pdf({path:'/tmp/slides-background-browser.pdf',printBackground:true,preferCSSPageSize:true});await page.evaluate(()=>window.releasePrint());await page.waitForFunction(()=>!document.querySelector('.slide-print-deck'));
  assert.deepEqual(errors,[]);console.log('Background cover/overlay, positioned text, source navigation, drag/resize/undo, presentation, and print export passed');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
