import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});

async function output(page){
 await page.locator('#save').click();const downloading=page.waitForEvent('download');await page.locator('#download-svg').click();
 return Buffer.concat(await(await(await downloading).createReadStream()).toArray()).toString();
}
async function open(page,svg){
 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'crop.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
 await expect(page.locator('#status')).toContainText('SVG opened');
}
async function setup(page){
 await page.goto('/');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const ctx=c.getContext('2d');for(const [color,x,y] of [['red',0,0],['blue',100,0],['green',0,50],['orange',100,50]]){ctx.fillStyle=color;ctx.fillRect(x,y,100,50);}return c.toDataURL().split(',')[1];});
 await page.locator('#image-file').setInputFiles({name:'colors.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.locator('#status')).toContainText('Image inserted');for(let i=0;i<3;i++)await page.locator('#rotate').click();
 return output(page);
}
async function projectPoint(page,xy){return page.evaluate(async xy=>{
 const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
 const p=paper.view.projectToView(new paper.Point(xy)),r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
},xy);}
async function dragCrop(page,polygon){
 await page.locator('#start-crop').click();const a=await projectPoint(page,polygon[0]),b=await projectPoint(page,polygon[2]);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
}
async function expectClipped(page,svg,original,polygon,subtract=false){
 const difference=await page.evaluate(async({svg,original,polygon,subtract})=>{
  async function render(source,clip){const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source);await image.decode();const c=document.createElement('canvas');c.width=1056;c.height=816;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,1056,816);if(clip){ctx.globalCompositeOperation=subtract?'destination-out':'destination-in';ctx.beginPath();polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}return ctx.getImageData(0,0,1056,816).data;}
  const actual=await render(svg,false),expected=await render(original,true);let differences=0,samples=0;
  for(let y=290;y<530;y+=3)for(let x=410;x<650;x+=3){const i=(y*1056+x)*4;if(expected[i+3]>0&&expected[i+3]<255)continue;samples++;if(Math.abs(actual[i+3]-expected[i+3])>20||expected[i+3]===255&&[0,1,2].some(j=>Math.abs(actual[i+j]-expected[i+j])>20))differences++;}
  return {differences,samples};
 },{svg,original,polygon,subtract});
 expect(difference.differences).toBeLessThan(12);
}

test('drag crop stays aligned with the canvas on a rotated image and survives undo and SVG reopening',async({page})=>{
 const original=await setup(page),polygon=[[480,373],[568,373],[568,443],[480,443]];
 await page.locator('#start-crop').click();const a=await projectPoint(page,polygon[0]),b=await projectPoint(page,polygon[2]);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});
 const preview=await page.evaluate(async()=>{
  await new Promise(requestAnimationFrame);const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
  return paper.project.layers[2].children.find(p=>p.strokeColor?.toCSS(true)==='#ed286e').segments.map(s=>[s.point.x,s.point.y]);
 });
 for(let i=0;i<4;i++)for(let axis=0;axis<2;axis++)expect(preview[i][axis]).toBeCloseTo(polygon[i][axis],3);
 await page.mouse.up();const cropped=await output(page);await expectClipped(page,cropped,original,polygon);
 await page.locator('#undo').click();await expectClipped(page,await output(page),original,[[0,0],[1056,0],[1056,816],[0,816]]);
 await page.locator('#redo').click();await page.reload();await expectClipped(page,await output(page),original,polygon);
 await open(page,cropped);await expectClipped(page,await output(page),original,polygon);
 await page.keyboard.press('Control+a');await page.locator('#image-crop summary').click();await page.locator('#reset-crop').click();
 await expectClipped(page,await output(page),original,[[0,0],[1056,0],[1056,816],[0,816]]);
});

for(const afterCrop of [false,true])for(const operation of ['intersect','subtract'])test(`${operation} uses the drawn asymmetric shape ${afterCrop?'after rectangular cropping':'on a rotated image'} through crop reset and SVG reopening`,async({page})=>{
 const fullOriginal=await setup(page);let original=fullOriginal;const polygon=[[482,378],[565,395],[540,438],[515,414]];
 if(afterCrop){await dragCrop(page,[[480,373],[568,373],[568,443],[480,443]]);original=await output(page);}
 await page.locator('#snapping').evaluate(el=>el.checked=false);await page.locator('[data-tool=pen]').click();for(const xy of [...polygon,polygon[0]]){const p=await projectPoint(page,xy);await page.mouse.click(p.x,p.y);}await page.locator('[data-tool=select]').click();await page.keyboard.press('Control+a');
 await page.locator(`[data-boolean=${operation}]`).click();await expect(page.locator('#status')).toContainText(operation==='intersect'?'Image clipped':'Shape subtracted');
 await page.screenshot({path:`/tmp/vector-lab-rotated-${operation}.png`});const cropped=await output(page);await expectClipped(page,cropped,original,polygon,operation==='subtract');
 await page.locator('#undo').click();await page.locator('#redo').click();await page.reload();await expectClipped(page,await output(page),original,polygon,operation==='subtract');
 // Rebase the crop frame after shape clipping, then save and reopen it. Reset
 // must retain the original shape restriction in its raster coordinates.
 const rectangle=[[500,383],[548,383],[548,433],[500,433]];
 await page.locator('[data-tool=select]').click();await page.keyboard.press('Control+a');await dragCrop(page,rectangle);
 const rectangular=await output(page);await expectClipped(page,rectangular,cropped,rectangle);
 await open(page,rectangular);await page.keyboard.press('Control+a');await page.locator('#image-crop summary').click();await page.locator('#reset-crop').click();
 // With a prior rectangular crop, Reset restores the pixels outside that crop.
 await expectClipped(page,await output(page),fullOriginal,polygon,operation==='subtract');
});
