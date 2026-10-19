const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');const assert=require('assert/strict');
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true,args:['--no-sandbox']});const p=await b.newPage({viewport:{width:1400,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{window.handoutDesktop={onMenuCommand:cb=>window.menu=cb};});
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
await load('# Questions\n\n:::question\nPick one\n- Same\n- Same*\n:::');await click('.mc-choice','- Same*',1);
await p.evaluate(()=>window.menu({command:'wrap-lines',payload:true}));
const lines=Array.from({length:35},(_,i)=>`${i+1}. ${'Long wrapping content '.repeat(15)}`);await load('# Long\n\n'+lines.join('\n'));
const result=await click('li',lines[30],30);assert.ok(result.scroll>2000);
// The selected line's measured top should be inside the viewport, even after wrap.
const visibility=await p.locator('#source').evaluate(el=>{const st=getComputedStyle(el);const mirror=document.createElement('div');Object.assign(mirror.style,{position:'absolute',visibility:'hidden',width:(el.clientWidth-parseFloat(st.paddingLeft)-parseFloat(st.paddingRight))+'px',font:st.font,whiteSpace:'pre-wrap',overflowWrap:'anywhere'});const prefix=document.createElement('span');prefix.textContent=el.value.slice(0,el.selectionStart);const mark=document.createElement('span');mark.textContent='\u200b';mirror.append(prefix,mark);document.body.append(mirror);const y=mark.getBoundingClientRect().top-mirror.getBoundingClientRect().top+parseFloat(st.paddingTop)-el.scrollTop;mirror.remove();return {y,height:el.clientHeight};});assert.ok(visibility.y>=0&&visibility.y<visibility.height,JSON.stringify(visibility));
assert.deepEqual(errors,[]);await b.close();console.log('Preview source mapping and wrapped-line reveal passed');})().catch(e=>{console.error(e);process.exit(1)});
