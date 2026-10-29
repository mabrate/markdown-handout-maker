import {rebuildCurvedCorners} from './curved-fillets.js';
// Serialization rounds coordinates; compare geometry numerically so a harmless
// round trip does not discard an otherwise valid editable corner.
function sameCornerGeometry(path,geometry){
 if(typeof geometry!=='string'||geometry.length>3000000)return false;
 if(geometry===path.pathData)return true;
 let reference;
 try{
  reference=new path.constructor({pathData:geometry,insert:false});
  return reference.closed===path.closed&&reference.segments.length===path.segments.length&&reference.segments.every((s,i)=>['point','handleIn','handleOut'].every(key=>s[key].getDistance(path.segments[i][key])<0.00003));
 }catch{return false;}finally{reference?.remove();}
}
// Keep the sharp source separate from generated tangent points.
export function cornerModel(path){
 const saved=path.data.cornerEffect;
 if(saved?.version===1&&Array.isArray(saved.source)&&saved.source.length>=2&&saved.source.length<=10000&&saved.source.every(s=>Array.isArray(s)&&s.length===3&&s.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))&&Array.isArray(saved.map)&&saved.map.length===path.segments.length&&saved.map.every(i=>Number.isInteger(i)&&i>=0&&i<saved.source.length)&&sameCornerGeometry(path,saved.geometry)&&saved.closed===path.closed&&saved.effects&&Object.values(saved.effects).every(e=>e&&['fillet','chamfer'].includes(e.type)&&Number.isFinite(e.amount)&&e.amount>=0)){
  const matrix=path.globalMatrix.values;
  if(saved.matrix&&matrix.some((v,i)=>Math.abs(v-saved.matrix[i])>1e-9)){
   const world=p=>({x:matrix[0]*p[0]+matrix[2]*p[1]+matrix[4],y:matrix[1]*p[0]+matrix[3]*p[1]+matrix[5]});
   for(const [key,effect] of Object.entries(saved.effects)){
    const i=Number(key),start=saved.map.indexOf(i),n=saved.source.length;if(start<0||!effect.amount||!eligible(saved.source,i,saved.closed))continue;
    if(effect.arcAngle){
     const segment=path.segments[start],anchor=path.localToGlobal(segment.point),handle=path.localToGlobal(segment.point.add(segment.handleOut));
     effect.amount=anchor.getDistance(handle)/(4/3*Math.tan(Math.abs(effect.arcAngle)/4));continue;
    }
    const p=world(saved.source[i][0]),a=world(saved.source[(i+n-1)%n][0]),b=world(saved.source[(i+1)%n][0]),t=path.localToGlobal(path.segments[start].point),u={x:a.x-p.x,y:a.y-p.y},v={x:b.x-p.x,y:b.y-p.y};
    const angle=Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/(Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y)))));
    effect.amount=Math.hypot(t.x-p.x,t.y-p.y)*(effect.type==='fillet'?Math.tan(angle/2):1);
   }
   saved.matrix=matrix;
  }
  return saved;
 }
 delete path.data.cornerEffect;
 return null;
}
export function straightCorner(source,index,closed){
 const n=source.length;if(!closed&&(index===0||index===n-1))return false;
 const [p,hi,ho]=source[index],a=source[(index+n-1)%n],b=source[(index+1)%n];
 if([...hi,...ho,...a[2],...b[1]].some(v=>Math.abs(v)>1e-8))return false;
 const u=[a[0][0]-p[0],a[0][1]-p[1]],v=[b[0][0]-p[0],b[0][1]-p[1]],length=Math.hypot(...u)*Math.hypot(...v);
 return length>1e-10&&Math.abs((u[0]*v[0]+u[1]*v[1])/length)<.999999;
}
export function eligible(source,index,closed,type='fillet'){
 if(type==='chamfer')return straightCorner(source,index,closed);
 const n=source.length;if(!Number.isInteger(index)||index<0||index>=n||(!closed&&(index===0||index===n-1)))return false;
 const [p,hi,ho]=source[index],a=source[(index+n-1)%n],b=source[(index+1)%n];
 const nonzero=v=>Math.hypot(...v)>1e-9;
 const u=nonzero(hi)?hi:nonzero(a[2])?[a[0][0]+a[2][0]-p[0],a[0][1]+a[2][1]-p[1]]:[a[0][0]-p[0],a[0][1]-p[1]];
 const v=nonzero(ho)?ho:nonzero(b[1])?[b[0][0]+b[1][0]-p[0],b[0][1]+b[1][1]-p[1]]:[b[0][0]-p[0],b[0][1]-p[1]],length=Math.hypot(...u)*Math.hypot(...v);
 return length>1e-10&&Math.abs((u[0]*v[0]+u[1]*v[1])/length)<.999999;
}
export function sourceFor(path){return path.segments.map(s=>[s.point,s.handleIn,s.handleOut].map(p=>[p.x,p.y]));}
export function rebuildCorners(paper,path,model){
 if(Object.entries(model.effects).some(([i,e])=>e.amount&&e.type==='fillet'&&eligible(model.source,Number(i),model.closed)&&!straightCorner(model.source,Number(i),model.closed)))return rebuildCurvedCorners(paper,path,model,eligible);
 // Measure in document space, including after a path has been scaled or rotated.
 const source=model.source.map(s=>{const p=path.localToGlobal(new paper.Point(s[0]));return [[p.x,p.y],s[1],s[2]];}),n=source.length,info=source.map((s,i)=>{
  const effect=model.effects[i];if(!effect||!effect.amount||!eligible(source,i,model.closed))return null;
  const p=new paper.Point(s[0]),u=new paper.Point(source[(i+n-1)%n][0]).subtract(p),v=new paper.Point(source[(i+1)%n][0]).subtract(p),angle=Math.acos(Math.max(-1,Math.min(1,u.dot(v)/(u.length*v.length))));
  return {p,u:u.normalize(),v:v.normalize(),angle,effect,d:effect.type==='fillet'?effect.amount/Math.tan(angle/2):effect.amount};
 });
 // Leave a tiny gap at the half-edge limit: SVG import otherwise merges
 // coincident tangent nodes and loses their independent corner identities.
 info.forEach((o,i)=>{if(o){o.d=Math.min(o.d,new paper.Point(source[(i+n-1)%n][0]).getDistance(o.p)/2*(1-1e-5),new paper.Point(source[(i+1)%n][0]).getDistance(o.p)/2*(1-1e-5));o.effect.amount=o.effect.type==='fillet'?o.d*Math.tan(o.angle/2):o.d;}});
 const segments=[],map=[];
 source.forEach((s,i)=>{const o=info[i];if(!o){segments.push(new paper.Segment(...model.source[i]));map.push(i);return;}
  const a=o.p.add(o.u.multiply(o.d)),b=o.p.add(o.v.multiply(o.d));let incoming=new paper.Point(0,0),outgoing=incoming;
  if(o.effect.type==='fillet'){const radius=o.d*Math.tan(o.angle/2),handle=4/3*Math.tan((Math.PI-o.angle)/4)*radius;outgoing=o.u.multiply(-handle);incoming=o.v.multiply(-handle);}
  const localA=path.globalToLocal(a),localB=path.globalToLocal(b);
  segments.push(new paper.Segment(localA,[0,0],path.globalToLocal(a.add(outgoing)).subtract(localA)),new paper.Segment(localB,path.globalToLocal(b.add(incoming)).subtract(localB),[0,0]));map.push(i,i);
 });
 path.applyMatrix=false;path.removeSegments();path.addSegments(segments);path.data.nodeModes=map.map((i,index)=>info[i]?(info[i].effect.type==='fillet'?'round':'corner'):(model.modes?.[i]||'corner'));model.map=map;model.geometry=path.pathData;model.matrix=path.globalMatrix.values;path.data.cornerEffect=model;
}
export function installCornerControls({paper,getNodes,getSelection,setSelection,commit,refresh,say,getTool=()=>'nodes',getUnit=()=>'px',getUnitScale=()=>1}){
 const controls=document.createElement('div');controls.id='corner-controls';controls.innerHTML='<h2>Corner treatment</h2><label>Type <select id="corner-type"><option value="fillet">Fillet</option><option value="chamfer">Chamfer</option></select></label><label><span id="corner-amount-label">Radius (px)</span> <input id="corner-amount" type="number" min="0" max="100000" step="1" value="10"></label><input id="corner-slider" aria-label="Corner amount" type="range" min="0" max="100" step="0.5" value="10"><button id="apply-corner">Apply corner</button><button id="reset-corner">Restore sharp corner</button><small id="corner-help">Select sharp corners between lines or curves. Chamfers require straight lines. Purple rings mark treated corners. Select either tangent node to edit an existing corner.</small>';
 controls.title='Select sharp corners between lines or curves. Chamfers require straight lines. Select either tangent node to edit an existing corner. Direct node edits turn treatments into ordinary paths.';document.getElementById('panel-align').append(controls);
 const type=controls.querySelector('#corner-type'),amount=controls.querySelector('#corner-amount'),slider=controls.querySelector('#corner-slider'),apply=controls.querySelector('#apply-corner'),reset=controls.querySelector('#reset-corner');
 function targets(treatment=type.value){const paths=new Map();return getNodes().filter(s=>{if(!paths.has(s.path)){const model=cornerModel(s.path);paths.set(s.path,{model,source:model?.source||sourceFor(s.path)});}const {model,source}=paths.get(s.path);return eligible(source,model?model.map[s.index]:s.index,s.path.closed,treatment);});}
 let displayedScale=1;
 const display=value=>Number(value.toFixed(8));
 function sync(){
  controls.hidden=getTool()!=='nodes';
  if(controls.hidden||document.getElementById('panel-align').hidden)return;
  const scale=getUnitScale(),changed=scale!==displayedScale;
  if(changed){amount.value=display(Number(amount.value)*displayedScale/scale);displayedScale=scale;}
  const nodes=targets();apply.disabled=slider.disabled=amount.disabled=!nodes.length;type.disabled=!targets('fillet').length;reset.disabled=!targets('fillet').length;
  const s=nodes[0],m=s&&cornerModel(s.path),effect=m?.effects[m.map[s.index]];
  if(effect&&(changed||![amount,slider,type].includes(document.activeElement))){type.value=effect.type;amount.value=display(effect.amount/scale);}
  amount.max=display(100000/scale);amount.step='any';slider.max=Math.max(100/scale,effect?effect.amount/scale:0,Number(amount.value)||0);slider.step=0.5/scale;slider.value=amount.value;
  controls.querySelector('#corner-amount-label').textContent=`${type.value==='fillet'?'Radius':'Distance'} (${getUnit()})`;
  slider.setAttribute('aria-label',`Corner amount (${getUnit()})`);
 }

 function update(value,save=true){if(!Number.isFinite(value)||value<0||value>100000){say(`Enter a corner amount between 0 and ${display(100000/getUnitScale())} ${getUnit()}.`);return;}const nodes=value===0?targets('fillet'):targets();if(!nodes.length)return;
  const groups=new Map();for(const s of nodes){const path=s.path;let entry=groups.get(path);if(!entry){const model=structuredClone(cornerModel(path))||{version:1,source:sourceFor(path),modes:path.segments.map(s=>path.data.nodeModes?.[s.index]||(s.isSmooth()?'round':'corner')),closed:path.closed,effects:{},map:path.segments.map(s=>s.index)};groups.set(path,entry={model,indices:new Set()});}entry.indices.add(entry.model.map[s.index]);}
  const next=[],prepared=[];
  try{
   for(const [path,{model,indices}] of groups){
    for(const i of indices)model.effects[i]={type:type.value,amount:value};
    const copy=path.clone({insert:false});copy.applyMatrix=false;copy.matrix=path.globalMatrix.clone();prepared.push({path,copy,indices});rebuildCorners(paper,copy,model);
   }
   for(const {path,copy,indices} of prepared){
    for(let item=path;item;item=item.parent)delete item.data.shapeBuild;
    path.applyMatrix=false;path.removeSegments();path.addSegments(copy.segments.map(s=>s.clone()));path.data.cornerEffect=copy.data.cornerEffect;path.data.nodeModes=copy.data.nodeModes;
    for(const i of indices)next.push(path.segments[path.data.cornerEffect.map.indexOf(i)]);
   }
  }catch(error){say(error.message);return;}finally{prepared.forEach(({copy})=>copy.remove());}
  setSelection(getSelection(),next);if(save)commit();else refresh();say(value?'Corner updated. Remaining lines and curves keep their shape.':'Sharp corner restored.');
 }
 apply.onclick=()=>update(Number(amount.value)*getUnitScale());amount.onchange=()=>update(Number(amount.value)*getUnitScale());slider.oninput=()=>{amount.value=slider.value;update(Number(slider.value)*getUnitScale(),false);};slider.onchange=()=>commit();type.onchange=()=>{if(targets().some(s=>cornerModel(s.path)))update(Number(amount.value)*getUnitScale());sync();};reset.onclick=()=>update(0);
 return {sync};
}
