// Repairs operate on path geometry; previews never replace the source artwork.
export function installNodeTools({paper,art,getTool,getSelection,getNodes,setSelection,commit,say,nodePosition,detach}){
 const artItemIndex=path=>{let item=path;while(item.parent&&item.parent!==art)item=item.parent;return item.index;};
 const paths=()=>getSelection().flatMap(i=>i instanceof paper.Path?[i]:i instanceof paper.CompoundPath?i.children:[]);
 const endpoints=()=>getNodes().filter(s=>s.path&&!s.path.closed&&(s===s.path.firstSegment||s===s.path.lastSegment));
 const join=document.getElementById('join-nodes'),close=document.getElementById('close-path'),simplify=document.getElementById('simplify-path');
 const panel=document.getElementById('panel-align'),objects=document.createElement('div');
 objects.id='object-alignment';while(panel.firstChild)objects.append(panel.firstChild);panel.append(objects);
 const nodeAlign=document.createElement('div');nodeAlign.id='node-alignment';nodeAlign.hidden=true;
 nodeAlign.innerHTML='<h2>Align nodes</h2><label>Relative to <select id="node-align-reference"><option value="middle">Selection center</option><option value="first">First selected node</option><option value="last">Last selected node</option><option value="min">Minimum coordinate</option><option value="max">Maximum coordinate</option></select></label><div class="pair"><button data-node-align="y" title="Move selected nodes to a common horizontal line">Align horizontally</button><button data-node-align="x" title="Move selected nodes to a common vertical line">Align vertically</button></div><h2>Distribute nodes</h2><div class="pair"><button data-node-distribute="x">Distribute horizontally</button><button data-node-distribute="y">Distribute vertically</button></div><small id="node-align-count" aria-live="polite"></small><small>Select nodes with Shift, Select multiple nodes, or drag a selection box. Distribution spaces nodes evenly and keeps the outer nodes fixed.</small>';
 panel.append(nodeAlign);
 function arrange(axis,distribute){
  const nodes=getNodes();if(nodes.length<(distribute?3:2))return;
  const entries=nodes.map(segment=>({segment,point:nodePosition(segment)}));
  const values=entries.map(o=>o.point[axis]),min=Math.min(...values),max=Math.max(...values),reference=document.getElementById('node-align-reference').value;
  const target=reference==='first'?values[0]:reference==='last'?values.at(-1):reference==='min'?min:reference==='max'?max:(min+max)/2;
  if(distribute)entries.sort((a,b)=>a.point[axis]-b.point[axis]);
  detach(nodes);
  entries.forEach((o,index)=>{const point=o.point.clone();point[axis]=distribute?min+(max-min)*index/(entries.length-1):target;o.segment.point=o.segment.path.globalToLocal(point);});
  commit();say(distribute?'Distributed selected nodes.':'Aligned selected nodes.');
 }
 nodeAlign.querySelectorAll('[data-node-align]').forEach(button=>button.onclick=()=>arrange(button.dataset.nodeAlign,false));
 nodeAlign.querySelectorAll('[data-node-distribute]').forEach(button=>button.onclick=()=>arrange(button.dataset.nodeDistribute,true));
 function sync(){const nodeMode=getTool()==='nodes';objects.hidden=nodeMode;nodeAlign.hidden=!nodeMode;const count=getNodes().length;document.getElementById('node-align-count').textContent=`${count} node${count===1?'':'s'} selected`;nodeAlign.querySelectorAll('[data-node-align]').forEach(button=>button.disabled=count<2);nodeAlign.querySelectorAll('[data-node-distribute]').forEach(button=>button.disabled=count<3);const ends=endpoints();join.disabled=getNodes().length!==2||ends.length!==2;close.disabled=!paths().some(p=>!p.closed&&p.segments.length>2);simplify.disabled=!paths().some(p=>p.segments.length>2);}
 close.onclick=()=>{const targets=paths().filter(p=>!p.closed&&p.segments.length>2);detach(targets.flatMap(p=>p.segments));targets.forEach(p=>p.closed=true);commit();say(`Closed ${targets.length} path(s).`);};
 join.onclick=()=>{const ends=endpoints();if(getNodes().length!==2||ends.length!==2)return;const [a,b]=ends;if(a.path===b.path){detach([a,b]);a.path.closed=true;commit();say('Joined endpoints to close the path.');return;}
  // Bake both transforms into a new path before joining, preserving curve handles.
  const world=p=>new paper.Path({insert:false,segments:p.segments.map(s=>{const point=nodePosition(s);return new paper.Segment(point,nodePosition(s,'handleIn').subtract(point),nodePosition(s,'handleOut').subtract(point));})});
  const modes=p=>p.segments.map(s=>p.data.nodeModes?.[s.index]||(s.isSmooth()?'round':'corner'));const firstModes=modes(a.path),secondModes=modes(b.path),first=world(a.path),second=world(b.path);first.style=a.path.style;if(a===a.path.firstSegment){first.reverse();firstModes.reverse();}if(b===b.path.lastSegment){second.reverse();secondModes.reverse();}first.data.nodeModes=[...firstModes,...secondModes];
  first.lastSegment.handleOut=[0,0];second.firstSegment.handleIn=[0,0];first.addSegments(second.segments.map(s=>s.clone()));second.remove();
  // Coincident endpoints can share one anchor without changing either curve.
  const index=a.path.segments.length-1,left=first.segments[index],right=first.segments[index+1];if(left.point.getDistance(right.point)<1e-7){left.handleOut=right.handleOut.clone();right.remove();first.data.nodeModes.splice(index+1,1);}
  const insertion=artItemIndex(a.path);detach([a,b]);const roots=[...new Set([a.path.parent,b.path.parent])];a.path.remove();b.path.remove();for(const root of roots)if(root instanceof paper.CompoundPath&&!root.children.length)root.remove();art.insertChild(Math.min(insertion,art.children.length),first);setSelection([first],[]);commit();say('Joined endpoints. The new path uses the first path’s style.');
 };
 const dialog=document.createElement('dialog');dialog.id='simplify-dialog';dialog.setAttribute('aria-labelledby','simplify-title');dialog.innerHTML='<h2 id="simplify-title">Simplify paths</h2><p>Pink shows the proposed outline over your original. Increase tolerance to remove more detail.</p><label>Tolerance (document pixels) <input id="simplify-tolerance" type="range" min="0" max="10" step="0.1" value="1"></label><output id="simplify-count" aria-live="polite"></output><div class="export-actions"><button id="simplify-cancel">Cancel</button><button id="simplify-apply" class="primary">Apply</button></div>';document.body.append(dialog);
 let targets=[],copies=[],preview=null;
 function cleanup(){preview?.remove();preview=null;copies.forEach(p=>p.remove());copies=[];targets=[];paper.view.update();}
 function update(){preview?.remove();copies.forEach(p=>p.remove());preview=new paper.Layer();preview.data.nodePreview=true;copies=[];const tolerance=Number(document.getElementById('simplify-tolerance').value);let before=0,after=0;
  for(const path of targets){const copy=path.clone({insert:false});before+=path.segments.length;if(tolerance>0){const scale=Math.max(path.globalMatrix.transform(new paper.Point(1,0)).subtract(path.globalMatrix.transform(new paper.Point(0,0))).length,path.globalMatrix.transform(new paper.Point(0,1)).subtract(path.globalMatrix.transform(new paper.Point(0,0))).length);copy.simplify(tolerance/Math.max(scale,1e-8));}if(copy.segments.length>=path.segments.length||copy.segments.length<(path.closed?3:2)){copy.copyContent(path);}copies.push(copy);after+=copy.segments.length;const outline=copy.clone({insert:false});outline.matrix=path.globalMatrix.clone();outline.fillColor=null;outline.strokeColor='#ed286e';outline.strokeWidth=2/paper.view.zoom;outline.strokeScaling=false;preview.addChild(outline);}
  art.activate();document.getElementById('simplify-count').textContent=`${before} → ${after} nodes`;document.getElementById('simplify-apply').disabled=after>=before;paper.view.update();
 }
 simplify.onclick=()=>{targets=paths().filter(p=>p.segments.length>2);if(!targets.length)return;dialog.showModal();update();};
 document.getElementById('simplify-tolerance').oninput=update;
 document.getElementById('simplify-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',cleanup);
 document.getElementById('simplify-apply').onclick=()=>{detach(targets.flatMap(p=>p.segments));targets.forEach((path,i)=>{path.copyContent(copies[i]);delete path.data.nodeModes;});setSelection(getSelection(),[]);dialog.close();cleanup();commit();say('Simplified paths. Undo restores the original nodes.');};
 return {sync};
}
