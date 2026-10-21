'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
(async () => {
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1550,height:1000}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const content=await fs.readFile(path.join(__dirname,'../demo/example-slides.md'),'utf8');
  await page.addInitScript(({content,image})=>{
   window.actions=[];window.contents={'/work/handout.md':'---\nlayout: half-portrait\n---\n# Handout\n\nPlain handout content.','/work/deck.md':content};
   const assets=[{relative:'pond-example.svg',url:image}];
   const snapshot=()=>({path:'/work',name:'work',assets,tree:Object.keys(window.contents).map(path=>({type:'file',markdown:true,path,name:path.split('/').pop()}))});
   window.handoutDesktop={platform:'linux',onMenuCommand:callback=>window.menu=callback,openFolder:async()=>snapshot(),refreshFolder:async()=>snapshot(),readFile:async path=>window.contents[path],
    saveFile:async(path,content)=>{window.contents[path]=content;},setDocumentMode:async(mode,theme)=>window.actions.push(['mode',mode,theme]),setPresentation:async active=>window.actions.push(['presentation',active]),
    exportPowerPoint:async(content,path)=>{window.actions.push(['pptx',content,path,document.querySelectorAll('.slide-print-deck .slide-card').length,document.querySelectorAll('#preview .slide-card').length]);return '/tmp/deck.pptx';},
    exportPdf:async layout=>{window.actions.push(['pdf',layout,document.querySelectorAll('.slide-print-deck .slide-card').length,document.querySelectorAll('.slide-print-deck .slide-notes').length]);return '/tmp/deck.pdf';},
    readGuide:async name=>'# '+name,saveGuide:async name=>'/tmp/'+name,openWebLink:async url=>window.actions.push(['link',url])};
  },{content,image:pathToFileURL(path.join(__dirname,'../demo/pond-example.svg')).href});
  await page.goto(pathToFileURL(path.join(__dirname,'../renderer/index.html')).href);
  await page.evaluate(()=>window.menu({command:'open-folder'}));
  await page.locator('#file-tree').getByRole('button',{name:'handout.md',exact:true}).click();await page.evaluate(()=>window.menu({command:'set-theme',payload:'modern'}));
  assert.equal(await page.locator('.slide-toolbar').isVisible(),false);assert.ok(await page.locator('.handout-page').count());
  await page.locator('#file-tree').getByRole('button',{name:'deck.md',exact:true}).click();
  const cards=page.locator('#preview .slide-card');await cards.waitFor();assert.equal(await cards.count(),1);assert.equal(await page.locator('.slide-outline button').count(),6);
  assert.equal(await page.getByRole('combobox',{name:'Slide layout',exact:true}).count(),0);assert.equal(await page.locator('.handout-page').count(),0);
  assert.equal(await page.locator('.slide-warning').count(),0);
  await page.locator('#preview .slide-frame').click();assert.equal(await page.locator('#preview').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('ArrowLeft');assert.equal(await cards.getAttribute('data-slide-index'),'0');
  for (const [key,index] of [['ArrowRight','1'],['ArrowDown','2'],['ArrowLeft','1'],['ArrowUp','0']]) {
   await page.keyboard.press(key);assert.equal(await cards.getAttribute('data-slide-index'),index);assert.equal(await page.locator('#preview').evaluate(el=>el===document.activeElement),true);
  }
  const beforeArrowEdit=await page.locator('#source').inputValue();await page.locator('#source').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#source').inputValue(),beforeArrowEdit);assert.equal(await page.locator('#source').evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'Next slide',exact:true}).click();assert.match(await cards.innerText(),/Learning objective/);assert.equal(await cards.getAttribute('data-slide-index'),'1');
  await page.locator('#source').evaluate(el=>{const offset=el.value.indexOf('# Living and nonliving');el.setSelectionRange(offset,offset);el.dispatchEvent(new Event('select'));});
  assert.equal(await cards.getAttribute('data-slide-index'),'2');assert.match(await cards.innerText(),/Living things/);assert.match(await cards.innerText(),/Nonliving surroundings/);
  await page.screenshot({path:'/tmp/slides-current-preview.png'});
  await page.getByRole('combobox',{name:'Slide theme',exact:true}).selectOption('dark');await page.waitForFunction(()=>document.querySelector('#preview .slide-canvas')?.style.backgroundColor==='rgb(32, 37, 45)');
  await page.getByRole('combobox',{name:'Slide aspect ratio',exact:true}).selectOption('4:3');await page.waitForFunction(()=>document.querySelector('#page-count').textContent.includes('4:3'));
  await page.locator('.document-tab-label').filter({hasText:'handout.md'}).click();assert.equal(await page.locator('.slide-toolbar').isVisible(),false);assert.equal(await page.locator('#layout-select').inputValue(),'half-portrait');assert.equal(await page.locator('body').getAttribute('data-handout-theme'),'modern');
  await page.locator('.document-tab-label').filter({hasText:'deck.md'}).click();assert.equal(await page.getByRole('combobox',{name:'Slide theme',exact:true}).inputValue(),'dark');assert.equal(await page.getByRole('combobox',{name:'Slide aspect ratio',exact:true}).inputValue(),'4:3');assert.equal(await cards.count(),1);
  await page.locator('.slide-outline button').nth(4).click();
  await page.getByRole('combobox',{name:'New slide',exact:true}).selectOption('content');await page.getByRole('button',{name:'Add slide',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button').length===7);
  assert.match(await page.locator('#source').inputValue(),/---\n\n# New slide/);assert.equal(await cards.count(),1);
  await page.locator('.slide-outline button').first().click();await page.getByRole('button',{name:'Present',exact:true}).click();
  const presenting=page.getByRole('dialog',{name:'Slideshow presentation'});await presenting.waitFor();
  assert.equal(await presenting.locator('button,footer,nav,select').count(),0);assert.equal(await presenting.getAttribute('data-slide-index'),'0');assert.ok(!(await presenting.innerText()).includes('Ask students what'));
  await page.keyboard.press('ArrowRight');assert.equal(await presenting.getAttribute('data-slide-index'),'1');await presenting.click({position:{x:20,y:20}});assert.equal(await presenting.getAttribute('data-slide-index'),'2');
  await page.keyboard.press('End');assert.equal(await presenting.getAttribute('data-slide-index'),'6');await page.keyboard.press('Escape');await page.locator('.slide-presentation').waitFor({state:'detached'});assert.deepEqual(errors,[]);assert.equal(await cards.getAttribute('data-slide-index'),'6');
  await page.waitForFunction(()=>window.actions.some(a=>a[0]==='presentation'&&a[1]===false));
  await page.getByRole('button',{name:'Export PowerPoint…',exact:true}).click();await page.getByText('PowerPoint saved to /tmp/deck.pptx',{exact:true}).waitFor();
  const pptx=await page.evaluate(()=>window.actions.filter(a=>a[0]==='pptx').at(-1));assert.equal(pptx[2],'/work/deck.md');assert.equal(pptx[3],7);assert.equal(pptx[4],1);assert.equal(await page.locator('.slide-print-deck').count(),0);
  await page.getByRole('button',{name:'Export PDF…',exact:true}).click();await page.waitForFunction(()=>window.actions.some(a=>a[0]==='pdf'));const pdf=await page.evaluate(()=>window.actions.filter(a=>a[0]==='pdf').at(-1));assert.deepEqual(pdf,['pdf','slides-standard',7,0]);
  await page.evaluate(()=>window.menu({command:'open-handout-guide',payload:'SLIDES_GUIDE.md'}));await page.getByRole('textbox',{name:'Guide text'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Guide text'}).inputValue(),'# SLIDES_GUIDE.md');await page.getByRole('button',{name:'Close guide',exact:true}).click();
  await page.locator('.slide-outline button').first().click();await page.getByRole('combobox',{name:'New slide',exact:true}).selectOption('bell-ringer');
  assert.deepEqual(await page.getByRole('combobox',{name:'New slide',exact:true}).locator('option').allTextContents(),['Blank content','Bell-ringer','Fullscreen image with text','Title slide']);
  const beforeAppend=await page.locator('#source').inputValue();await page.getByRole('button',{name:'Append slide',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button').length===8);
  const afterAppend=await page.locator('#source').inputValue();assert.ok(afterAppend.startsWith(beforeAppend));assert.match(afterAppend.slice(beforeAppend.length),/^\n---\n\n# Class Topic or Goal/);assert.equal(await cards.getAttribute('data-slide-index'),'7');
  assert.ok(afterAppend.endsWith("# Class Topic or Goal\n\n**Bell Ringer:** What is the most interesting organism you've observed in the garden\n\n**Agenda:**\n- Observe the example.\n- Test one idea.\n- Record your evidence.\n\n:::notes\nMaterials and teacher reminders go here.\n:::\n\n"));
  await page.locator('#preview .slide-frame').click();await page.keyboard.press('ArrowRight');assert.equal(await cards.getAttribute('data-slide-index'),'7');
  await page.evaluate(()=>window.menu({command:'new-slides'}));await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button').length===3);assert.equal(await cards.count(),1);
  const starter=await page.locator('#source').inputValue();assert.ok(!starter.includes(':::slide'));assert.match(starter,/---\n\n# Investigate/);
  await page.getByRole('button',{name:'Present',exact:true}).click();await presenting.waitFor();await page.evaluate(()=>window.menu({command:'new-slides'}));await page.locator('.slide-presentation').waitFor({state:'detached'});
  await page.locator('#source').evaluate(el=>{const offset=el.value.indexOf('\n---\n\n# Investigate');el.setSelectionRange(offset,offset);});
  await page.evaluate(()=>window.menu({command:'slide-snippet',payload:'columns'}));await page.waitForFunction(()=>document.querySelector('#source').value.includes(':::columns\n:::column'));
  const crowded='---\ntype: slides\n---\n# Crowded observations\n\n'+Array.from({length:12},(_,n)=>`- Observation ${n+1}`).join('\n')+'\n\n:::notes\nPrivate reminders\n:::\n\n---\n# Next slide\nUntouched text\n';
  await page.locator('#source').fill(crowded);await page.waitForFunction(()=>document.querySelectorAll('.slide-outline button').length===2);await page.locator('.slide-outline button').first().click();
  const shrink=page.getByRole('button',{name:'Shrink text to fit',exact:true}), createColumns=page.getByRole('button',{name:'Create columns',exact:true});
  await shrink.waitFor();assert.equal(await shrink.isEnabled(),true);assert.equal(await createColumns.isEnabled(),true);
  await page.screenshot({path:'/tmp/slides-overflow-actions.png'});
  await shrink.click();await page.waitForFunction(()=>document.querySelector('#source').value.includes(':::fit'));
  await page.waitForFunction(()=>!document.querySelector('#preview .slide-warning'));
  const fittedSource=await page.locator('#source').inputValue();assert.ok(fittedSource.endsWith('---\n# Next slide\nUntouched text\n'));assert.equal(await cards.getAttribute('data-slide-index'),'0');
  assert.ok(await page.evaluate(()=>{const deck=window.HandoutSlides.parse(document.querySelector('#source').value);return window.HandoutSlides.scene(deck,0).textScale<1;}));
  assert.ok(!(await cards.locator('.slide-canvas').innerText()).includes('Private reminders'));
  await page.locator('#source').focus();await page.keyboard.press('Control+z');assert.equal(await page.locator('#source').inputValue(),crowded);await page.locator('#source').evaluate(el=>{el.setSelectionRange(0,0);el.dispatchEvent(new Event('select'));});await createColumns.waitFor();await createColumns.click();await page.waitForFunction(()=>document.querySelector('#source').value.includes(':::columns'));
  await page.waitForFunction(()=>!document.querySelector('#preview .slide-warning'));
  assert.equal(await cards.getAttribute('data-slide-index'),'0');assert.ok((await page.locator('#source').inputValue()).endsWith('---\n# Next slide\nUntouched text\n'));
  assert.equal(await cards.locator('.slide-canvas').innerText().then(text=>(text.match(/Observation \d+/g)||[]).length),12);
  await page.screenshot({path:'/tmp/slides-overflow-columns.png'});
  await page.locator('#source').focus();await page.keyboard.press('Control+z');assert.equal(await page.locator('#source').inputValue(),crowded);
  assert.deepEqual(errors,[]);console.log('Separator syntax, current-slide preview, content blocks, menu-free presenting, and whole-deck export routing passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
