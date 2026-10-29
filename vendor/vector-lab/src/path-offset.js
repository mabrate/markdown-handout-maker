import ClipperLib from 'clipper-lib';
const SCALE=1000;

export function offsetPath(paper,item,distance,join='round'){
 if(!(item instanceof paper.PathItem)||!(item instanceof paper.CompoundPath?item.children.every(p=>p.closed):item.closed))throw Error('Select closed vector paths to offset.');
 if(!Number.isFinite(distance)||!distance||Math.abs(distance)>10000)throw Error('Enter a nonzero offset up to 10,000 pixels.');
 const contours=[];let count=0;
 for(const source of item instanceof paper.CompoundPath?item.children:[item]){
  const flat=source.clone({insert:false});
  try{
   flat.flatten(.1/Math.max(1,source.globalMatrix.getScaling().length));
   const contour=flat.segments.map(s=>{const p=source.localToGlobal(s.point);if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.max(Math.abs(p.x),Math.abs(p.y))>1e8)throw Error('This path is too large to offset.');return {X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)};});
   count+=contour.length;if(count>50000)throw Error('This path is too complex to offset.');if(contour.length>=3)contours.push(contour);
  }finally{flat.remove();}
 }
 // Normalize winding and resolve overlaps before offsetting, preserving holes.
 const clipper=new ClipperLib.Clipper(),normalized=[];
 clipper.AddPaths(contours,ClipperLib.PolyType.ptSubject,true);
 const fill=item.fillRule==='evenodd'?ClipperLib.PolyFillType.pftEvenOdd:ClipperLib.PolyFillType.pftNonZero;
 clipper.Execute(ClipperLib.ClipType.ctUnion,normalized,fill,fill);
 const offset=new ClipperLib.ClipperOffset(2,.1*SCALE),solution=[];
 const joins={round:ClipperLib.JoinType.jtRound,miter:ClipperLib.JoinType.jtMiter,square:ClipperLib.JoinType.jtSquare};
 offset.AddPaths(normalized,joins[join]??joins.round,ClipperLib.EndType.etClosedPolygon);offset.Execute(solution,distance*SCALE);
 if(!solution.length)throw Error('This inset removes the entire path. Try a smaller distance.');
 const paths=solution.map(points=>new paper.Path({segments:points.map(p=>[p.X/SCALE,p.Y/SCALE]),closed:true,insert:false}));
 const result=paths.length===1?paths[0]:new paper.CompoundPath({children:paths,insert:false});
 result.style=item.style.clone();result.fillRule='nonzero';result.opacity=item.opacity;result.visible=item.visible;result.blendMode=item.blendMode;
 return result;
}

export function installPathOffset({paper,art,getSelection,getTool,unit,unitScale,commit}){
 const button=document.createElement('button');button.id='offset-path';button.textContent='Offset path';button.hidden=true;document.querySelector('.object-actions').append(button);
 const dialog=document.createElement('dialog');dialog.id='offset-dialog';dialog.setAttribute('aria-labelledby','offset-title');dialog.innerHTML='<form method="dialog"><h2 id="offset-title">Offset path</h2><label>Distance (<span id="offset-unit"></span>) <input id="offset-distance" type="number" step="any" value="0.1"></label><p>Positive expands outward; negative insets. Closed paths only.</p><label>Corners <select id="offset-join"><option value="round">Round</option><option value="miter">Miter</option><option value="square">Square</option></select></label><label><input id="offset-keep" type="checkbox"> Keep original paths</label><p id="offset-status" role="status"></p><div class="pair"><button value="cancel">Cancel</button><button id="offset-apply" type="button">Apply offset</button></div></form>';
 document.body.append(dialog);
 const $=id=>dialog.querySelector('#'+id);let originals=[],results=[],layer=null,frame=null;
 const eligible=item=>item instanceof paper.PathItem&&(item instanceof paper.CompoundPath?item.children.length&&item.children.every(p=>p.closed):item.closed);
 function clear(){results.forEach(p=>p.remove());results=[];}
 function preview(){
  frame=null;clear();$('offset-apply').disabled=true;
  try{
   const distance=$('offset-distance').valueAsNumber*unitScale();
   for(const item of originals)results.push(offsetPath(paper,item,distance,$('offset-join').value));
   for(const result of results){layer.addChild(result);result.strokeColor='#267d81';result.strokeWidth=1.5/paper.view.zoom;result.fillColor=null;result.dashArray=[6/paper.view.zoom,4/paper.view.zoom];}
   $('offset-status').textContent='Preview only. Apply to change the paths.';$('offset-apply').disabled=false;
  }catch(error){clear();$('offset-status').textContent=error.message;}
  art.activate();paper.view.update();
 }
 function schedule(){if(frame!==null)cancelAnimationFrame(frame);frame=requestAnimationFrame(preview);}
 button.onclick=()=>{originals=[...getSelection()];if(!originals.length||!originals.every(eligible))return;layer=new paper.Layer();layer.name='offset-preview';art.activate();$('offset-unit').textContent=unit();$('offset-distance').value=unit()==='in'?'.1':unit()==='mm'?'2':'10';dialog.showModal();preview();};
 $('offset-distance').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('offset-apply').click();}});
 $('offset-distance').addEventListener('input',schedule);$('offset-join').addEventListener('change',schedule);
 $('offset-apply').onclick=()=>{
  if(frame!==null){cancelAnimationFrame(frame);preview();}
  if(!results.length||originals.some(item=>!item.isInserted()))return;
  results.forEach((result,index)=>{const original=originals[index];result.style=original.style.clone();result.fillRule='nonzero';art.insertChild(original.index+1,result);if(!$('offset-keep').checked)original.remove();});
  const selection=getSelection();selection.splice(0,selection.length,...results);results=[];dialog.close();commit();
 };
 dialog.addEventListener('close',()=>{if(frame!==null)cancelAnimationFrame(frame);frame=null;clear();layer?.remove();layer=null;art.activate();paper.view.update();});
 dialog.querySelector('form').addEventListener('submit',e=>{if(e.submitter?.value!=='cancel'){e.preventDefault();$('offset-apply').click();}});
 return {sync(){const selected=getSelection();button.hidden=getTool()!=='select'||!selected.length||!selected.every(eligible);}};
}
