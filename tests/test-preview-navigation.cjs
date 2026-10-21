const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,args:['--no-sandbox']});const p=await b.newPage({viewport:{width:1400,height:900}});p.setDefaultTimeout(10000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{window.openedLinks=[];window.handoutDesktop={onMenuCommand:cb=>window.menu=cb,openWebLink:async url=>window.openedLinks.push(url)};});
await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '../renderer/index.html')).href);
async function load(text){await p.locator('#source').fill(text);await p.waitForTimeout(350);}
async function click(selector,expected,index=0){await p.locator('#preview '+selector).nth(index).click();await p.waitForTimeout(120);const result=await p.locator('#source').evaluate(el=>({selected:el.value.slice(el.selectionStart,el.selectionEnd),scroll:el.scrollTop,start:el.selectionStart}));assert.equal(result.selected,expected);return result;}
await load('---\nlayout: letter\n---\n# Lists\n\n- Same\n- Same\n  - Nested\n    continuation\n- End');
await click('li','- Same',0);const repeated = await click('li','- Same',1);assert.equal(repeated.start,await p.locator('#source').evaluate(el=>el.value.indexOf('- Same',el.value.indexOf('- Same')+1)));await click('li','  - Nested\n    continuation',2);await click('li','- End',3);
await load('# Test\n\n<!-- comment\nmore -->\n\n:::checklist\n- First\n- Second\n:::\n\n:::wrap\n- Wrapped\n- Next\n:::\n\n:::grid columns=2\n:::cell\n- Cell one\n:::cell\n- Cell two\n:::\n\n| A | B |\n| --- | --- |\n| C | D |');
await click('.checklist li','- Second',1);await click('.text-wrap li','- Next',1);await click('.grid li','- Cell two',1);await click('tbody tr','| C | D |');
await load('<table>\n<tr><td>First row</td></tr>\n<tr><td>Second row</td></tr>\n</table>');await click('tr','<tr><td>Second row</td></tr>',1);
await load('---\nlayout: half-duplicate-portrait\n---\n- First\n- Second');await p.evaluate(()=>window.menu({command:'set-layout',payload:'half-duplicate-portrait'}));await click('li','- Second',3);
await p.evaluate(()=>window.menu({command:'set-layout',payload:'letter'}));
await load('# Extras\n\n[qr:https://example.com]\n\n{{space:60:box}}\n\n{{lines:3}}');
await click('.qr-code','[qr:https://example.com]');await click('.drawing-space','{{space:60:box}}');await click('.answer-lines','{{lines:3}}');
const image='![Preview image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAIAAAAiz+n/AAAAnElEQVR4nO3QQREAIAzAsIFypOOiPEgU9LrmDIH9OuAXRkeMjhgdMTpidMToiNERoyNGR4yOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjREaMjRkeMjhgdMTpidMToiNERoyNGR4yOGB0xOmJ0xOiI0RGjI0ZHjI4YHTE6YnTE6IjREaMjRkeMjhgdMTpidMToiNERoyNGR4yOXHnOAPgRYPpSAAAAAElFTkSuQmCC)';
await load('# Image source\n\n'+image);await click('img',image);assert.equal(await p.getByRole('button',{name:'Resize image proportionally'}).count(),1,await p.locator('#preview img').evaluate(el=>el.outerHTML));
await load('# Questions\n\n:::question\nPick one\n- Same\n- Same*\n:::');await click('.mc-choice','- Same*',1);
await p.evaluate(()=>window.menu({command:'wrap-lines',payload:true}));
const lines=Array.from({length:35},(_,i)=>`${i+1}. ${'Long wrapping content '.repeat(15)}`);await load('# Long\n\n'+lines.join('\n'));
const result=await click('li',lines[30],30);assert.ok(result.scroll>2000);
// The selected line's measured top should be inside the viewport, even after wrap.
const visibility=await p.locator('#source').evaluate(el=>{const st=getComputedStyle(el);const mirror=document.createElement('div');Object.assign(mirror.style,{position:'absolute',visibility:'hidden',width:(el.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight))+'px',font:st.font,whiteSpace:'pre-wrap',overflowWrap:'anywhere'});const prefix=document.createElement('span');prefix.textContent=el.value.slice(0,el.selectionStart);const mark=document.createElement('span');mark.textContent='\u200b';mirror.append(prefix,mark);document.body.append(mirror);const y=mark.getBoundingClientRect().top-mirror.getBoundingClientRect().top+parseFloat(st.paddingTop)-el.scrollTop;mirror.remove();return {y,height:el.clientHeight};});assert.ok(visibility.y>=0&&visibility.y<visibility.height,JSON.stringify(visibility));
const slides='---\ntype: slides\n---\n# Source mapped title\n\nA [web link](https://example.com) to open.\n\n- Same\n- Same\n  - Nested\n    continuation\n\n:::notes\nPrivate reminders.\n:::\n\nAfter the notes.\n\n---\n:::fit\n# Columns\n\n:::columns\n:::column\n## Left column\n\n'+image+'\n\n:::column\n:::center\n## Centered heading\n:::\n\n| A | B |\n| --- | --- |\n| C | D |\n:::\n:::\n\n---\n:::fit\n# Code source\n\n```md\n---\n:::columns\n```\n\n'+lines[30]+'\n:::\n';
await load(slides);
await p.locator('.slide-outline button').first().click();
async function mappedClick(text,selector='.slide-text',occurrence=0){let offset=-1;for(let n=0;n<=occurrence;n++)offset=slides.indexOf(text,offset+1);assert.ok(offset>=0);const line=slides.slice(0,offset).split('\n').length-1;return click(`${selector}[data-source-start="${line}"]`,text);}
await mappedClick('# Source mapped title');await mappedClick('- Same');const slideRepeated=await mappedClick('- Same','.slide-text',1);assert.equal(slideRepeated.start,slides.indexOf('- Same',slides.indexOf('- Same')+1));
await mappedClick('  - Nested\n    continuation');await mappedClick('After the notes.');
await p.locator('.slide-notes summary').click();await mappedClick('Private reminders.','.slide-notes pre');
await click('.slide-canvas a','A [web link](https://example.com) to open.');
await p.locator('#preview .slide-canvas a').click({modifiers:['Control']});assert.deepEqual(await p.evaluate(()=>window.openedLinks),['https://example.com/']);
assert.equal(await p.locator('#source').evaluate(el=>el.value.slice(el.selectionStart,el.selectionEnd)),'A [web link](https://example.com) to open.');
await p.locator('.slide-outline button').nth(1).click();await mappedClick('# Columns');await mappedClick('## Left column');await mappedClick(image,'img');await mappedClick('## Centered heading');await mappedClick('| C | D |','tr');await p.screenshot({path:'/tmp/preview-source-selection.png'});
await p.locator('.slide-outline button').nth(2).click();await mappedClick('```md\n---\n:::columns\n```');const slideWrapped=await mappedClick(lines[30]);assert.ok(slideWrapped.scroll>200);
assert.equal(await p.locator('#source').inputValue(),slides,'Preview navigation must not edit the document');
assert.deepEqual(errors,[]);await b.close();console.log('Preview source mapping and wrapped-line reveal passed');})().catch(e=>{console.error(e);process.exit(1)});
