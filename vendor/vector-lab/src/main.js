let handoutSessionLoading = true;
import {createBrowserRecovery} from './browser-recovery.js';
import {createInteractionOverlay} from './interaction-overlay.js';
import {installPathOffset} from './path-offset.js';
import {alphaBounds} from './alpha-bounds.js';
import {embedEditableSVG,readEditableSVG} from './editable-png.js';
import {createPNG} from './png-export.js';
import {installCornerControls,cornerModel} from './corner-effects.js';
import {installStrokeControls,resizeStroke} from './stroke-style.js';
import {installNodeTools} from './node-tools.js';
import {dimensionExpression} from './dimension-expression.js';
import {svgFilename,canShareSVG} from './file-sharing.js';
import paper from 'paper';
import {wrapText,restoreTextLayout,migrateTextFont} from './text-layout.js';
var textAlignment='left';
import {textFormat,textWidth as formattedTextWidth,textGeometry,installFormattedText} from './text-format.js';
import {createFontLibrary} from './font-library.js';
import {installFontPicker} from './font-picker.js';
const fontLibrary=createFontLibrary();
installFormattedText(paper,fontLibrary);
const fontReady=fontLibrary.ensure('Arimo');fontReady.catch(()=>{});
var fontPicker;
import './style.css';
import { installBackgroundRemoval } from './background-removal.js';
import { installImageTracing } from './image-tracing-dialog.js';
import { shapeRecord, restoreShape, transformedBuild, validBuild } from './shape-building.js';
import { groupObjects,ungroupObjects,isObjectGroup } from './object-grouping.js';
import {applyBlob,smoothBlobPoints} from './blob-brush.js';
import {createBucketFill} from './paint-bucket.js';
import { installColorPickers } from './colors.js';
installColorPickers();
const $=id=>document.getElementById(id);
paper.setup($('canvas'));
const DEFAULT_PAGE={width:1056,height:816};
let pageSize={...DEFAULT_PAGE},clipboard=[],pasteCount=0;
const units={in:96,mm:96/25.4,px:1,pt:96/72};
let dimensionsEnabled=false;try{dimensionsEnabled=localStorage.getItem('vector-lab-dimensions')==='true';}catch{}
const applePlatform=/Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform||navigator.platform||navigator.userAgent);
function shortcutLabel(keys){return keys.map(key=>key==='Mod'?(applePlatform?'⌘':'Ctrl'):key==='Shift'&&applePlatform?'⇧':key).join(applePlatform?'':'+');}
function shortcutARIA(keys){return keys.map(key=>key==='Mod'?(applePlatform?'Meta':'Control'):key).join('+');}
const background=new paper.Layer();
new paper.Path.Rectangle({rectangle:new paper.Rectangle(0,0,pageSize.width,pageSize.height),fillColor:'white'});
const art=new paper.Layer(), overlay=new paper.Layer(),penOverlay=new paper.Layer();
penOverlay.name='pen-overlay';
const interactionOverlay=createInteractionOverlay(paper,overlay);
let refreshFrame=null,frameBounds=null,readingFrameBounds=false,lastControlsKey=null,lastPageKey=null,lastDimensionsEnabled=null;
function requestRefresh(){if(refreshFrame!==null)return;refreshFrame=requestAnimationFrame(()=>{refreshFrame=null;refresh({interactive:true});});}
let penPreviewFrame=null;
let tool='select',selected=[],path=null,drag=null,node=null,history=[],future=[],pointers=new Map(),gesture=null,guides=[],lastNodeTap=null,lastTouchToggle=-Infinity,styleSelection=null,selectedNodes=[],activePanel="style",viewFitted=true;
function openPanel(name){if(!['style','align'].includes(name))name='style';activePanel=name;for(const key of ['style','align'])$(`panel-${key}`).hidden=key!==name;document.querySelectorAll('[data-panel],[data-open-panel]').forEach(b=>{b.classList.toggle('active',(b.dataset.panel||b.dataset.openPanel)===name);b.setAttribute('aria-pressed',String((b.dataset.panel||b.dataset.openPanel)===name));});document.querySelector('.properties').scrollTop=0;}
document.querySelectorAll('[data-panel],[data-open-panel]').forEach(b=>b.onclick=()=>{openPanel(b.dataset.panel||b.dataset.openPanel);refresh();});
const hints={blob:'Draw a filled path. Connected closed paths merge into the brush color. Choose a brush size in Formatting.',bucket:'Click an enclosed vector area to create a new path in the current fill color. Close any gaps first.',text:'Click to place text; drag to set a wrapping box width. Edit text in Formatting.',select:'Drag empty space to select. Drag shapes to move; handles resize; round handle rotates.',nodes:'Drag anchors or handles. Ctrl/Cmd snaps handles to 15°. Double-click an anchor for smooth / corner.',pen:'Tap for corners. Drag for curves. Hold Ctrl/Cmd to snap segments and handles to 15°. Tap the first point to close.',rectangle:'Drag to draw a rectangle.',ellipse:'Drag to draw an ellipse.',dropper:'Click for a color; drag from center to edge to average a circle. Applies to selected shapes or the next shape.',crop:'Select an image, then drag a rectangle from inside or outside it to keep that area. Reset crop restores the original.',pan:'Drag to move the view.'};
// Action feedback takes priority; resume quiet usage tips after time to read it.
const usageTips=[
()=> 'Save SVG to keep an editable copy, especially before leaving a shared device.',
()=> 'Turn on Dimensions to edit a selection’s position and size.',
()=> 'Use Select multiple to select objects, then align or combine them.',
()=> 'Pinch to zoom; use two fingers to move the canvas.',
()=> 'Drag with the middle mouse button, or hold Shift and scroll, to pan.',
()=> `Arrow keys move a selection by ${$('units').value==='in'?'⅛':1} ${$('units').value}; Shift moves it by ${nudgeAmount(true)} ${$('units').value}.`,
()=> 'In Align, one selected object aligns to the page; multiple objects align to the last selected.',
()=> 'Use Nodes to edit anchors and curves. Drag empty space to box-select nodes.',
()=> 'Use Break apart to recover the original shapes after combining them.',
()=> 'Crop an image by dragging the area to keep. Reset crop restores the original.',
()=> 'Use the Dropper to sample a color; drag a circle to average the colors inside.',
()=> 'Open a saved SVG here to keep editing your drawing.'
];
let tipIndex=0,tipTimer;
function showUsageTip(){
// Automatic tips stay readable without repeated screen-reader announcements.
$('status').setAttribute('aria-live','off');
$('status').textContent=`Tip · ${usageTips[tipIndex]()}`;
tipIndex=(tipIndex+1)%usageTips.length;
tipTimer=setTimeout(showUsageTip,12000);
}
function say(text){clearTimeout(tipTimer);$('status').setAttribute('aria-live','polite');$('status').textContent=text;tipTimer=setTimeout(showUsageTip,12000);}
tipTimer=setTimeout(showUsageTip,12000);
function pickerColor(id){const color=new paper.Color($(id).value);color.alpha=$(id).alpha;return color;}
function syncSelectedStyle(){if(['bucket','blob'].includes(tool))return;const item=selected.length===1?selected[0]:null;if(item!==styleSelection){styleSelection=item;if(item&&!imageParts(item)){for(const id of ['fill','stroke']){const color=item[`${id}Color`];if(color){const rgb=color.convert('rgb');rgb.alpha=1;$(id).setColor(rgb.toCSS(true),color.alpha);}$(id).setNone(!color);$(`no-${id}`).checked=!color;}}}}
function style(){return {...strokeControls?.style(),fillColor:$('no-fill').checked?null:pickerColor('fill'),strokeColor:$('no-stroke').checked?null:pickerColor('stroke'),strokeWidth:Math.max(0,Math.min(100000,(Number($('width').value)||0)*units[$('units').value]))};}
function snapshot(){art.data.page={...pageSize};return art.exportJSON({asString:true,precision:15});}
let browserRecovery;
function persist(saved){if(window.handoutVectorLab){if(!handoutSessionLoading)window.handoutVectorLab.dirty(true);return;}browserRecovery?.save(saved??snapshot(),drawingName);if(browserRecovery?.mode==='saved')say('Recovered locally · Save SVG to keep a copy');else if(browserRecovery?.mode==='unavailable')say('Browser recovery unavailable. Save an SVG copy.');}
function commit(render=true){const s=snapshot();if(history.at(-1)!==s){history.push(s);if(history.length>60)history.shift();future=[];}persist(s);if(render)refresh();}
function restore(s){const view={zoom:paper.view.zoom,center:paper.view.center.clone()};viewFitted=false;hideHandleSize();art.removeChildren();art.importJSON(s);art.getItems({class:paper.PointText}).forEach(migrateTextFont);pageSize={...(art.data.page||DEFAULT_PAGE)};selected=[];selectedNodes=[];path=null;node=null;paper.view.zoom=view.zoom;paper.view.center=view.center;refresh();persist();ensureDocumentFonts();}
function setTool(t){hideHandleSize();if(path)finish();tool=t;for(const id of ['stroke','width'])$(id).closest('label').hidden=['bucket','blob'].includes(t);document.querySelectorAll('.stroke-detail').forEach(label=>label.hidden=['bucket','blob'].includes(t));$('blob-settings').hidden=t!=='blob';if(['bucket','blob'].includes(t)){selected=[];$('no-fill').checked=false;$('fill').setNone(false);$('stroke-picker').hidden=true;$('stroke').setAttribute('aria-expanded','false');}node=null;selectedNodes=[];$('panel-nodes').hidden=t!=='nodes';if(t==='nodes'){if(activePanel!=='align')openPanel('style');if(selected.some(isObjectGroup))say('Ungroup to edit individual paths.');else if(selected.some(i=>i.data.shapeBuild))say('Edit the combined outline directly. Undo restores the original combination.');}else if(['text','pen','rectangle','ellipse','dropper','bucket','blob'].includes(t))openPanel('style');else if(activePanel==='nodes')openPanel(t==='select'?'dimensions':'style');document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));$('tool-name').textContent=t[0].toUpperCase()+t.slice(1);$('hint').textContent=hints[t];refresh();}
function finish(){if(!path)return;if(path.segments.length<2)path.remove();path=null;$('finish').hidden=true;commit();}
function cancelPen(){if(!path)return;const unfinished=path;path=null;unfinished.remove();selected=selected.filter(item=>item!==unfinished);drag=null;$('finish').hidden=true;persist();}
function undoPenNode(){if(!path)return;path.lastSegment.remove();if(!path.segments.length)cancelPen();else persist();refresh();}
function fit(){viewFitted=true;hideHandleSize();paper.view.zoom=Math.max(.1,Math.min((paper.view.viewSize.width-50)/pageSize.width,(paper.view.viewSize.height-50)/pageSize.height));paper.view.center=new paper.Point(pageSize.width/2,pageSize.height/2);refresh();}
function syncControls(){for(const id of ['duplicate','delete','shrink','grow','rotate','flip-horizontal','flip-vertical','raise','lower','front','back'])$(id).disabled=!selected.length;document.querySelectorAll('[data-boolean]').forEach(button=>button.disabled=selected.length!==2);$('group-objects').disabled=selected.length<2;$('ungroup-objects').disabled=!selected.some(isObjectGroup);$('break-apart').disabled=!selected.some(i=>i.data.shapeBuild);for(const button of document.querySelectorAll('[data-boolean],#group-objects,#ungroup-objects,#break-apart'))button.hidden=button.disabled;for(const id of ['duplicate','shrink','grow','rotate','flip-horizontal','flip-vertical'])$(id).hidden=tool==='nodes';for(const group of document.querySelectorAll('.toolbar-icon-group'))group.hidden=[...group.children].every(button=>button.hidden);$('canvas-undo').disabled=!path&&history.length<=1;$('canvas-redo').disabled=!future.length;pathOffset?.sync();syncText();$('dropper-settings').hidden=tool!=='dropper';syncCrop();selectedNodes=selectedNodes.filter(s=>s.path?.isInserted()&&selected.includes(s.path)||s.path?.parent instanceof paper.CompoundPath&&selected.includes(s.path.parent));nodeTools?.sync();cornerControls?.sync();$('node-count').textContent=`${selectedNodes.length} node${selectedNodes.length===1?'':'s'} selected`;if(tool==='nodes')$('delete').disabled=!selectedNodes.length;$('delete').title=`${tool==='nodes'?'Delete selected nodes':'Delete selected objects'} (Delete / Backspace)`;$('delete').setAttribute('aria-label',tool==='nodes'?'Delete selected nodes':'Delete selected objects');syncSelectedStyle();strokeControls?.sync();$('undo').disabled=!path&&history.length<2;$('redo').disabled=!future.length;}
function refresh({interactive=false}={}){
if(refreshFrame!==null){cancelAnimationFrame(refreshFrame);refreshFrame=null;}
cancelPenPreviewFrame();
// Cache bounds only within this render. Geometry edits outside it always read fresh bounds.
frameBounds=selected.reduce((r,i)=>r?r.unite(i.bounds):i.bounds.clone(),null);readingFrameBounds=true;
try{
const controlsKey=[tool,activePanel,selected.map(i=>i.id).join(','),selectedNodes.map(n=>n.path?.id+':'+n.index).join(','),!!path,history.length,future.length,$('units').value].join('|');
if(!interactive||controlsKey!==lastControlsKey){syncControls();lastControlsKey=controlsKey;}
const pageKey=[pageSize.width,pageSize.height,$('units').value].join('|');
if(pageKey!==lastPageKey){background.firstChild.bounds=new paper.Rectangle(0,0,pageSize.width,pageSize.height);document.querySelector('.page-label').textContent=`ARTBOARD · ${formatLength(pageSize.width)} × ${formatLength(pageSize.height)} ${$('units').value.toUpperCase()}`;lastPageKey=pageKey;}
const visiblePage=new paper.Rectangle(0,0,pageSize.width,pageSize.height).intersect(paper.view.bounds);$('return-to-page').hidden=visiblePage.width>0&&visiblePage.height>0;if(handleContext&&(selected.length!==handleContext.items.length||selected.some(i=>!handleContext.items.includes(i)||!i.isInserted())))hideHandleSize();updateDimensions();if(selected.length===1&&!imageParts(selected[0])&&document.activeElement!==$('width'))$('width').value=Number((selected[0].strokeWidth/units[$('units').value]).toFixed(8));interactionOverlay.begin();overlay.activate();const z=paper.view.zoom;
interactionOverlay.rectangle({rectangle:new paper.Rectangle(0,0,pageSize.width,pageSize.height),strokeColor:'#9aaea5',strokeWidth:1/z,fillColor:null});
for(const item of selected.filter(i=>i.isInserted())){
if((tool==='nodes'||tool==='pen')&&editablePaths(item).length){for(const s of editablePaths(item).flatMap(p=>p.segments)){const anchor=nodePosition(s);for(const key of ['handleIn','handleOut']){if(s[key].length){const p=nodePosition(s,key);interactionOverlay.line({from:anchor,to:p,strokeColor:'#d37525',strokeWidth:1/z});interactionOverlay.circle({center:p,radius:4/z,fillColor:'#fff',strokeColor:'#d37525',strokeWidth:1.5/z});}}interactionOverlay.rectangle({point:anchor.subtract(selectedNodes.includes(s)?[6/z,6/z]:[4/z,4/z]),size:selectedNodes.includes(s)?[12/z,12/z]:[8/z,8/z],fillColor:selectedNodes.includes(s)?'#ed286e':'white',strokeColor:selectedNodes.includes(s)?'#671133':'#267d81',strokeWidth:(selectedNodes.includes(s)?3:1.5)/z});}}
else interactionOverlay.rectangle({rectangle:item.bounds.expand(6/z),strokeColor:selected.length>1&&item===selected.at(-1)?'#83ae35':'#267d81',strokeWidth:(selected.length>1&&item===selected.at(-1)?3:1.5)/z,dashArray:[5/z,3/z]});}
if(drag?.textBox)interactionOverlay.rectangle({rectangle:new paper.Rectangle(drag.start,drag.end),strokeColor:'#267d81',strokeWidth:1/z,dashArray:[5/z,3/z]});
if(tool==='nodes')for(const item of selected)for(const path of editablePaths(item)){
 const model=cornerModel(path);if(!model)continue;
 for(const [key,effect] of Object.entries(model.effects)){
  if(!effect.amount)continue;
  const indices=model.map.flatMap((value,index)=>value===Number(key)?[index]:[]);
  for(const index of indices){const marker=interactionOverlay.circle({center:nodePosition(path.segments[index]),radius:9/z,strokeColor:'#8954c7',strokeWidth:2/z,fillColor:null});marker.data.cornerMarker=true;}
 }
}
if(tool==='select'&&selected.length&&!drag?.marquee){const bounds=selectionBounds();for(const h of resizeHandles(bounds))interactionOverlay.rectangle({point:h.point.subtract([5/z,5/z]),size:[10/z,10/z],fillColor:'white',strokeColor:'#267d81',strokeWidth:1.5/z});const center=drag?.rotating?drag.bounds.topCenter.rotate(drag.angle,drag.center):bounds.topCenter,rotation=rotationHandle(bounds);interactionOverlay.line({from:center,to:rotation,strokeColor:'#267d81',strokeWidth:1.5/z});interactionOverlay.circle({center:rotation,radius:6/z,fillColor:'#c9f278',strokeColor:'#267d81',strokeWidth:1.5/z});}
if(drag?.blob){interactionOverlay.path({segments:smoothBlobPoints(drag.points,drag.diameter,drag.smoothing),strokeColor:drag.color,strokeWidth:drag.diameter,strokeCap:'round',strokeJoin:'round'});if(drag.points.length===1)interactionOverlay.circle({center:drag.points[0],radius:drag.diameter/2,fillColor:drag.color});}
if(drag?.dropper){const radius=Math.max(drag.radius,2/z);interactionOverlay.circle({center:drag.start,radius,strokeColor:'white',strokeWidth:4/z});interactionOverlay.circle({center:drag.start,radius,strokeColor:'#203c43',strokeWidth:1.5/z,dashArray:[5/z,3/z]});}
if(drag?.crop)interactionOverlay.path({segments:[drag.box.topLeft,drag.box.topRight,drag.box.bottomRight,drag.box.bottomLeft].map(p=>drag.item.localToGlobal(p)),closed:true,strokeColor:'#ed286e',strokeWidth:2/z,fillColor:new paper.Color(1,1,1,.2),dashArray:[6/z,3/z]});
if(drag?.marquee||drag?.nodeMarquee)interactionOverlay.rectangle({rectangle:new paper.Rectangle(drag.start,drag.end||drag.start),strokeColor:'#267d81',fillColor:new paper.Color(.15,.5,.5,.1),strokeWidth:1/z,dashArray:[5/z,3/z]});
if(path?.firstSegment)interactionOverlay.circle({center:path.firstSegment.point,radius:6/z,strokeColor:'#267d81',fillColor:'white',strokeWidth:2/z});
if(tool!=='pen'||!path)drawGuides(z,interactionOverlay);
interactionOverlay.end();
renderPenPreview();
syncDimensionLabels();syncRotationReadout();art.activate();paper.view.update();
}finally{readingFrameBounds=false;frameBounds=null;}
}
function cancelPenPreviewFrame(){
if(penPreviewFrame!==null){cancelAnimationFrame(penPreviewFrame);penPreviewFrame=null;}
}
function schedulePenPreview(){
if(penPreviewFrame!==null)return;
penPreviewFrame=requestAnimationFrame(()=>{penPreviewFrame=null;renderPenPreview();paper.view.update();});
}
function renderPenPreview(){
penOverlay.removeChildren();penOverlay.activate();const z=paper.view.zoom;
if(tool==='pen'&&path?.lastSegment&&!drag&&!gesture){
const cursor=cursorViewPoint();
guides=[];
if(cursor){const p=paper.view.viewToProject(cursor),closing=penClosing(p),last=path.lastSegment;
const end=closing?path.firstSegment.point:penPoint(p,last.point,penModifiers);
const preview=new paper.Path({segments:[new paper.Segment(last.point,null,last.handleOut),new paper.Segment(end,closing?path.firstSegment.handleIn:null)],strokeColor:'#267d81',strokeWidth:1.5/z,dashArray:[6/z,4/z],fillColor:null});
preview.name='pen-preview';
if(closing)new paper.Path.Circle({center:end,radius:9/z,strokeColor:'#267d81',strokeWidth:2/z,fillColor:null});
}
}
if(tool==='pen'&&path)drawGuides(z);
art.activate();
}
function point(e){return paper.view.viewToProject(new paper.Point(e.offsetX,e.offsetY));}
function artItem(item){while(item.parent&&item.parent!==art)item=item.parent;return item;}
function hit(p,pathsOnly=false){const h=art.hitTest(p,{fill:true,stroke:true,tolerance:10/paper.view.zoom,match:pathsOnly?h=>editablePaths(artItem(h.item)).length>0:undefined});if(h)h.item=artItem(h.item);return h;}
function editablePaths(item){return item instanceof paper.Path?[item]:item instanceof paper.CompoundPath?item.children:[];}
// Component records describe the original boolean result, not subsequent node edits.
function detachNodeBuild(segments){for(const path of new Set(segments.map(s=>s.path)))delete path.data.cornerEffect;for(const item of new Set(segments.map(segment=>artItem(segment.path))))delete item.data.shapeBuild;}
// Segments and handles are path-local; input, overlays and marquee boxes are
// project coordinates. Convert vectors separately so translations cancel out.
function nodePosition(segment,key='point'){return segment.path.localToGlobal(key==='point'?segment.point:segment.point.add(segment[key]));}
function pathVector(path,vector){return path.globalToLocal(vector).subtract(path.globalToLocal(new paper.Point(0,0)));}
function nodeHit(p){let best=null,d=15/paper.view.zoom;for(const item of selected){for(const segment of editablePaths(item).flatMap(p=>p.segments)){for(const key of ['point','handleIn','handleOut']){if(key!=='point'&&!segment[key].length)continue;const q=nodePosition(segment,key);const n=q.getDistance(p);if(n<d){d=n;best={segment,key};}}}}return best;}
// In Nodes mode, a covering fill must not steal clicks on another path's outline.
function nodePathHit(p){
const options={fill:false,stroke:true,curves:true,tolerance:10/paper.view.zoom};
for(const selectedOnly of [true,false]){const result=art.hitTest(p,{...options,match:result=>{const item=artItem(result.item);return editablePaths(item).length>0&&(!selectedOnly||selected.includes(item));}});if(result){result.item=artItem(result.item);return result;}}
return hit(p,true);
}
// Guides live only on the overlay and never enter the saved SVG.
function drawGuides(z,renderer={line:options=>new paper.Path.Line(options),text:options=>new paper.PointText(options),rectangle:options=>new paper.Path.Rectangle(options)}){
for(const g of guides){renderer.line({from:g.from,to:g.to,strokeColor:g.label?'#8b54af':'#dd658c',strokeWidth:1/z,dashArray:g.label?[]:[5/z,4/z]});
if(g.label){const midpoint=new paper.Point(g.from).add(g.to).divide(2),label=renderer.text({point:midpoint,content:g.label,justification:'center',fillColor:'#79439b',fontSize:12/z});label.position=midpoint;const backing=renderer.rectangle({rectangle:label.bounds.expand(6/z,2/z),fillColor:'white'});backing.insertBelow(label);}}
}
function selectionBounds(){if(readingFrameBounds)return frameBounds?.clone()||null;return selected.reduce((r,i)=>r?r.unite(i.bounds):i.bounds.clone(),null);}
function snapPosition(p,bounds=null){
guides=[];if(!$('snapping').checked)return p;
const tolerance=8/paper.view.zoom, others=art.children.filter(i=>!selected.includes(i)), targets=[new paper.Rectangle(0,0,pageSize.width,pageSize.height),...others.map(i=>i.bounds)];
const edges=$('snap-edges').checked,centers=$('snap-centers').checked,nodes=$('snap-nodes').checked;
const xs=targets.flatMap(r=>[...(edges?[r.left,r.right]:[]),...(centers?[r.center.x]:[])]),ys=targets.flatMap(r=>[...(edges?[r.top,r.bottom]:[]),...(centers?[r.center.y]:[])]);
for(const item of others)if(nodes)for(const path of editablePaths(item))for(const s of path.segments){const p=nodePosition(s);xs.push(p.x);ys.push(p.y);}
if(nodes&&path)for(const s of path.segments){if(s!==drag?.segment){const p=nodePosition(s);xs.push(p.x);ys.push(p.y);}}
const result=p.clone();let labels=[];
for(const axis of ['x','y']){const values=axis==='x'?xs:ys;const sources=bounds?(axis==='x'?[bounds.left,bounds.center.x,bounds.right]:[bounds.top,bounds.center.y,bounds.bottom]):[p[axis]];
let best=tolerance,delta=0,target=null,sourceIndex=0,equal=false;
const lock=drag?.snapLocks?.[axis];if(lock&&Math.abs(lock.target-sources[lock.index])<14/paper.view.zoom){best=-1;delta=lock.target-sources[lock.index];target=lock.target;sourceIndex=lock.index;equal=lock.equal;}
for(const [index,a] of sources.entries())for(const b of values){if(Math.abs(b-a)<best){best=Math.abs(b-a);delta=b-a;target=b;sourceIndex=index;equal=false;}}
// A third shape can snap into the exact midpoint of a gap.
if(bounds&&centers){for(const a of others)for(const b of others){if(a===b)continue;const ar=a.bounds,br=b.bounds;let start,end,overlap;
if(axis==='x'){start=ar.right;end=br.left;overlap=Math.min(ar.bottom,br.bottom,bounds.bottom)-Math.max(ar.top,br.top,bounds.top)>0;}
else{start=ar.bottom;end=br.top;overlap=Math.min(ar.right,br.right,bounds.right)-Math.max(ar.left,br.left,bounds.left)>0;}
const size=axis==='x'?bounds.width:bounds.height,center=(start+end)/2,diff=center-bounds.center[axis];
if(overlap&&end-start>=size&&Math.abs(diff)<best){best=Math.abs(diff);delta=diff;target=center;sourceIndex=1;equal=true;}}}
if(drag){drag.snapLocks??={};drag.snapLocks[axis]=target===null?null:{target,index:sourceIndex,equal};}if(equal)labels.push('Equal spacing');
result[axis]+=delta;
if(target!==null)guides.push({from:axis==='x'?[target,0]:[0,target],to:axis==='x'?[target,pageSize.height]:[pageSize.width,target]});
}
if(guides.length)say(labels.length?'Equal spacing':'Snapped to edge, center, or node');return result;
}
function spacingFeedback(bounds){
const candidates={left:null,right:null,top:null,bottom:null};
for(const item of art.children){if(selected.includes(item))continue;const r=item.bounds;
const yOverlap=Math.min(bounds.bottom,r.bottom)>Math.max(bounds.top,r.top),xOverlap=Math.min(bounds.right,r.right)>Math.max(bounds.left,r.left);
const y=(Math.max(bounds.top,r.top)+Math.min(bounds.bottom,r.bottom))/2,x=(Math.max(bounds.left,r.left)+Math.min(bounds.right,r.right))/2;
const options=[];
if(yOverlap&&r.right<=bounds.left)options.push(['left',bounds.left-r.right,[r.right,y],[bounds.left,y]]);
if(yOverlap&&r.left>=bounds.right)options.push(['right',r.left-bounds.right,[bounds.right,y],[r.left,y]]);
if(xOverlap&&r.bottom<=bounds.top)options.push(['top',bounds.top-r.bottom,[x,r.bottom],[x,bounds.top]]);
if(xOverlap&&r.top>=bounds.bottom)options.push(['bottom',r.top-bounds.bottom,[x,bounds.bottom],[x,r.top]]);
for(const [side,gap,from,to] of options)if(!candidates[side]||gap<candidates[side].gap)candidates[side]={gap,from,to,label:String(formatLength(gap))};
}
for(const g of Object.values(candidates))if(g)guides.push(g);
}
function resizeHandles(b){return [['nw',b.topLeft],['n',b.topCenter],['ne',b.topRight],['e',b.rightCenter],['se',b.bottomRight],['s',b.bottomCenter],['sw',b.bottomLeft],['w',b.leftCenter]].map(([name,point])=>({name,point}));}
function resizeHit(p){if(!selected.length)return null;return resizeHandles(selectionBounds()).find(h=>h.point.getDistance(p)<12/paper.view.zoom);}
function beginResize(h,p){const bounds=selectionBounds();const opposite={nw:'bottomRight',n:'bottomCenter',ne:'bottomLeft',e:'leftCenter',se:'topLeft',s:'topCenter',sw:'topRight',w:'rightCenter'};
const originals=selected.map(item=>{const applyMatrix=item.applyMatrix,source=applyMatrix&&item instanceof paper.PathItem?item.clone({insert:false}):null;item.applyMatrix=false;return {item,matrix:item.matrix.clone(),applyMatrix,source};});
drag={resize:h.name,start:p,handle:h.point.clone(),anchor:bounds[opposite[h.name]].clone(),bounds,originals};}
function resetResizeOriginal(original){
const {item,source}=original;item.applyMatrix=false;item.matrix=original.matrix.clone();
// Rebuild from an immutable vector snapshot so each frame uses final geometry
// semantics without accumulating transforms or temporarily stretching strokes.
if(source){if(item instanceof paper.CompoundPath)item.removeChildren();item.copyContent(source);item.style=source.style.clone();item.applyMatrix=original.applyMatrix;}
}
function updateResize(p,modifiers){if(!drag.moved&&p.getDistance(drag.start)*paper.view.zoom<4)return;drag.moved=true;const end=snapPosition(p.subtract(drag.start).add(drag.handle)),a=modifiers.shiftKey?drag.bounds.center:drag.anchor,h=drag.handle;let sx=1,sy=1;
const horizontal=/[ew]/.test(drag.resize)&&Math.abs(h.x-a.x)>.001,vertical=/[ns]/.test(drag.resize)&&Math.abs(h.y-a.y)>.001;
if(horizontal)sx=Math.max(.01,(end.x-a.x)/(h.x-a.x));
if(vertical)sy=Math.max(.01,(end.y-a.y)/(h.y-a.y));
if(modifiers.ctrlKey){const scale=!horizontal?sy:!vertical?sx:Math.abs(sx-1)>=Math.abs(sy-1)?sx:sy;sx=sy=scale;guides=[];}
const m=new paper.Matrix(sx,0,0,sy,a.x*(1-sx),a.y*(1-sy));for(const o of drag.originals){resetResizeOriginal(o);o.item.transform(m);}const b=selectionBounds();say(`${formatLength(b.width)} × ${formatLength(b.height)} ${$('units').value}`);}
function rotationHandle(bounds){const p=bounds.topCenter.subtract([0,32/paper.view.zoom]);return drag?.rotating?drag.bounds.topCenter.subtract([0,32/paper.view.zoom]).rotate(drag.angle,drag.center):p;}
function beginRotation(p,e){const bounds=selectionBounds(),center=bounds.center;const originals=selected.map(item=>{const applyMatrix=item.applyMatrix;item.applyMatrix=false;return {item,matrix:item.matrix.clone(),applyMatrix};});drag={rotating:true,bounds,center,originals,lastAngle:p.subtract(center).angle,rawAngle:0,angle:0,pointerType:e.pointerType||'mouse',handleRadius:p.getDistance(center)*paper.view.zoom,fineRotation:false,lastPoint:p.clone()};updateRotation(p,e);}
function updateRotation(p,e={}){
const radius=p.getDistance(drag.center)*paper.view.zoom;drag.lastPoint=p.clone();if(radius<8)return;
const angle=p.subtract(drag.center).angle,delta=(angle-drag.lastAngle+540)%360-180;drag.rawAngle+=delta;drag.lastAngle=angle;
const touch=['touch','pen'].includes(drag.pointerType),outward=radius-drag.handleRadius;
// A screen-pixel threshold works at every zoom. Hysteresis avoids mode flicker.
if(touch){if(!drag.fineRotation&&outward>80)drag.fineRotation=true;else if(drag.fineRotation&&outward<60)drag.fineRotation=false;}
drag.rotationStep=e.ctrlKey?15:touch?(drag.fineRotation?1:15):0;
drag.angle=drag.rotationStep?Math.round(drag.rawAngle/drag.rotationStep)*drag.rotationStep:drag.rawAngle;
const m=new paper.Matrix().rotate(drag.angle,drag.center);for(const o of drag.originals){o.item.matrix=o.matrix.clone();o.item.transform(m);}guides=[];say(`Rotation: ${Number(drag.angle.toFixed(1))}° · ${drag.rotationStep?drag.rotationStep+'° '+(drag.rotationStep===1?'precision':'snap'):'free'}`);
}
var rotationReadout=document.createElement('div');rotationReadout.id='rotation-readout';rotationReadout.hidden=true;$('stage').append(rotationReadout);
function syncRotationReadout(){if(!rotationReadout)return;rotationReadout.hidden=!drag?.rotating||!!gesture;if(rotationReadout.hidden)return;const touch=['touch','pen'].includes(drag.pointerType);rotationReadout.replaceChildren();const value=document.createElement('strong');value.textContent=`${Number(drag.angle.toFixed(1))}° · ${drag.rotationStep?drag.rotationStep+'° '+(drag.rotationStep===1?'precision':'snap'):'free'}`;rotationReadout.append(value);if(touch){const hint=document.createElement('small');hint.textContent=drag.fineRotation?'Move closer for 15° snap':'Move farther out for 1° precision';rotationReadout.append(hint);}const p=paper.view.projectToView(drag.lastPoint),stage=$('stage');rotationReadout.style.left=`${Math.max(4,Math.min(p.x+22,stage.clientWidth-rotationReadout.offsetWidth-4))}px`;rotationReadout.style.top=`${Math.max(4,Math.min(p.y-rotationReadout.offsetHeight-26,stage.clientHeight-rotationReadout.offsetHeight-4))}px`;}
for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{if(e.key==='Control'&&drag?.rotating&&!gesture){updateRotation(drag.lastPoint,{ctrlKey:type==='keydown'});refresh();}});
function drawingRectangle(p,modifiers){
  const raw=p.subtract(drag.start),width=Math.abs(raw.x),height=Math.abs(raw.y),largest=Math.max(width,height),zoom=paper.view.zoom;
  // A small release margin prevents flicker at the square/circle snap boundary.
  const tolerance=drag.equalDimensions?Math.min(12/zoom,largest*.12):Math.min(8/zoom,largest*.08);
  drag.equalDimensions=$('snapping').checked&&Math.min(width,height)*zoom>=12&&Math.abs(width-height)<=tolerance;
  let delta=snapPosition(p).subtract(drag.start);
  if(modifiers.ctrlKey||drag.equalDimensions){if(drag.equalDimensions&&!modifiers.ctrlKey)delta=raw;const size=Math.max(Math.abs(delta.x),Math.abs(delta.y));delta=new paper.Point((delta.x<0?-1:1)*size,(delta.y<0?-1:1)*size);guides=[];}
  return new paper.Rectangle(modifiers.shiftKey?drag.start.subtract(delta):drag.start,drag.start.add(delta));
}
function nodeMode(s){return s.path.data.nodeModes?.[s.index]||(s.isSmooth()?'round':'corner');}
function setNodeMode(s,mode){s.path.data.nodeModes??={};s.path.data.nodeModes[s.index]=mode;}
function changeNodes(mode){const targets=selectedNodes.length?selectedNodes:node?[node.segment]:[];if(!targets.length)return say('Select one or more nodes first.');detachNodeBuild(targets);for(const s of targets){const old=nodeMode(s);if(mode==='corner'){if(old==='corner'){s.handleIn=[0,0];s.handleOut=[0,0];}setNodeMode(s,'corner');}else{let direction=s.handleOut.length?s.handleOut.normalize():s.handleIn.length?s.handleIn.normalize(-1):(s.next?.point||s.point).subtract(s.previous?.point||s.point).normalize();if(!direction.length)direction=new paper.Point(1,0);const before=s.previous?s.point.getDistance(s.previous.point):null,after=s.next?s.point.getDistance(s.next.point):null;const incoming=s.handleIn.length||(before??after??0)/3,outgoing=s.handleOut.length||(after??before??0)/3,length=!s.handleIn.length&&!s.handleOut.length?Math.min(incoming,outgoing):(incoming+outgoing)/2;s.handleIn=direction.multiply(-(mode==='symmetric'?length:incoming));s.handleOut=direction.multiply(mode==='symmetric'?length:outgoing);setNodeMode(s,mode);}}$('linked').checked=true;commit();say(`${targets.length} node(s): ${mode}`);}
function toggleNode(){if(!node)return say('Select a node first.');selectedNodes=[node.segment];changeNodes(nodeMode(node.segment)==='corner'&&!node.segment.handleIn.length&&!node.segment.handleOut.length?'round':'corner');}
$('node-corner').onclick=()=>changeNodes('corner');$('node-round').onclick=()=>changeNodes('round');$('node-symmetric').onclick=()=>changeNodes('symmetric');
const canvas=$('canvas');
var strokeControls=installStrokeControls({getSelection:()=>selected.filter(i=>!imageParts(i)),getWidth:()=>Math.max(0,Math.min(100000,(Number($('width').value)||0)*units[$('units').value])),commit});
var nodeTools=installNodeTools({paper,art,canvas,getTool:()=>tool,getSelection:()=>selected,getNodes:()=>selectedNodes,setSelection:(items,nodes)=>{selected=items;selectedNodes=nodes;node=null;},commit,say,nodePosition,detach:detachNodeBuild});
var cornerControls=installCornerControls({paper,getTool:()=>tool,getUnit:()=>$('units').value,getUnitScale:()=>units[$('units').value],getNodes:()=>selectedNodes,getSelection:()=>selected,setSelection:(items,nodes)=>{selected=items;selectedNodes=nodes;node=null;},commit,refresh,say});
var pathOffset=installPathOffset({paper,art,getSelection:()=>selected,getTool:()=>tool,unit:()=>$('units').value,unitScale:()=>units[$('units').value],commit});
let cursorPosition=null,penModifiers={ctrlKey:false,metaKey:false};
function trackCursor(e){cursorPosition=e.pointerType==='touch'?null:{x:e.clientX,y:e.clientY};penModifiers={ctrlKey:e.ctrlKey,metaKey:e.metaKey};}
canvas.addEventListener('pointermove',trackCursor);
canvas.addEventListener('pointerenter',e=>{trackCursor(e);if(tool==='pen'&&path)schedulePenPreview();});
canvas.addEventListener('pointerleave',()=>{cursorPosition=null;if(tool==='pen'&&path)schedulePenPreview();});
canvas.addEventListener('pointercancel',()=>cursorPosition=null);
document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.target!==canvas)cursorPosition=null;else trackCursor(e);});
window.addEventListener('blur',()=>{cursorPosition=null;penModifiers={ctrlKey:false,metaKey:false};if(tool==='pen'&&path)schedulePenPreview();});
function cursorViewPoint(){
if(!cursorPosition)return null;
const r=canvas.getBoundingClientRect(),x=cursorPosition.x-r.left,y=cursorPosition.y-r.top;
return x>=0&&y>=0&&x<r.width&&y<r.height?new paper.Point(x,y):null;
}


var lastPathTap=null;
function editDoubleClick(p){const found=nodeHit(p);if(found?.key==='point'){node=found;toggleNode();return;}const options={fill:false,stroke:true,curves:true,tolerance:10/paper.view.zoom};let hit;for(const selectedOnly of [true,false]){hit=art.hitTest(p,{...options,match:h=>h.location&&editablePaths(artItem(h.item)).length&&(!selectedOnly||selected.includes(artItem(h.item)))});if(hit)break;}if(!hit?.location)return;const target=hit.location.curve.path,oldModes=target.segments.map(nodeMode);detachNodeBuild(target.segments);const segment=hit.location.curve.divideAtTime(hit.location.time)?.segment1;if(!segment)return;oldModes.splice(segment.index,0,'round');target.data.nodeModes=oldModes;selected=[artItem(target)];selectedNodes=[segment];node={segment,key:'point'};commit();say('Added a node without changing the curve.');}
canvas.addEventListener('dblclick',e=>{if(tool==='nodes'&&performance.now()-lastTouchToggle>=500)editDoubleClick(point(e));});

function cancelDrawingForGesture(){
canvas.classList.remove('middle-panning');
if(drag?.originals)for(const o of drag.originals){resetResizeOriginal(o);o.item.applyMatrix=o.applyMatrix;o.source?.remove();}
if(drag?.positions)selected.forEach((item,index)=>item.position=drag.positions[index]);
if(drag?.nodeOriginals)for(const o of drag.nodeOriginals)o.segment.point=o.point;
if(drag?.nodeMarquee)selectedNodes=drag.previousNodes;
if(drag?.originalSegment){const {segment}=drag.node,original=drag.originalSegment;segment.point=original.point;segment.handleIn=original.handleIn;segment.handleOut=original.handleOut;}
if(drag?.segment){drag.segment.remove();if(path&&!path.segments.length){path.remove();selected=[];path=null;$('finish').hidden=true;}}
if(drag?.created){drag.created.remove();selected=[];}
if(drag?.marquee)selected=drag.previous;
drag=null;guides=[];lastNodeTap=null;
}
canvas.addEventListener('wheel',e=>{hideHandleSize();
e.preventDefault();if(drag||gesture)return;
const unit=e.deltaMode===1?16:e.deltaMode===2?paper.view.viewSize.height:1;
viewFitted=false;
if(e.ctrlKey){const anchor=point(e);paper.view.zoom=Math.max(.15,Math.min(8,paper.view.zoom*Math.exp(-e.deltaY*unit*.01)));paper.view.center=paper.view.center.add(anchor.subtract(point(e)));}
else paper.view.center=paper.view.center.add(new paper.Point((e.shiftKey?(e.deltaX||e.deltaY):e.deltaX)*unit,(e.shiftKey?0:e.deltaY)*unit).divide(paper.view.zoom));
requestRefresh();
},{passive:false});
function penClosing(p){return path&&path.segments.length>2&&p.getDistance(path.firstSegment.point)<16/paper.view.zoom;}
function penPoint(p,origin,modifiers){
if(!origin||!(modifiers.ctrlKey||modifiers.metaKey))return snapPosition(p);
const delta=p.subtract(origin);delta.angle=Math.round(delta.angle/15)*15;
const constrained=origin.add(delta);
// Intersect nearby alignment targets with the angle-constrained ray, so
// positional snapping never bends the requested 15-degree direction.
snapPosition(constrained);
let result=constrained,best=8/paper.view.zoom;
for(const guide of guides){const axis=guide.from[0]===guide.to[0]?'x':'y',index=axis==='x'?0:1;
if(Math.abs(delta[axis])<1e-8)continue;
const scale=(guide.from[index]-origin[axis])/delta[axis];
if(scale<0)continue;
const candidate=origin.add(delta.multiply(scale)),distance=candidate.getDistance(constrained);
if(distance<best){best=distance;result=candidate;}
}
guides=guides.filter(guide=>Math.abs(result[guide.from[0]===guide.to[0]?'x':'y']-guide.from[guide.from[0]===guide.to[0]?0:1])<1e-6);
return result;
}
function updatePenHandle(p,modifiers){
drag.lastPoint=p;const delta=p.subtract(drag.start);
if(modifiers.ctrlKey||modifiers.metaKey)delta.angle=Math.round(delta.angle/15)*15;
drag.segment.handleOut=delta;drag.segment.handleIn=delta.negate();if(delta.length)setNodeMode(drag.segment,'round');
}
for(const type of ['keydown','keyup'])window.addEventListener(type,e=>{
if(['Control','Meta'].includes(e.key)){penModifiers={ctrlKey:e.ctrlKey,metaKey:e.metaKey};if(drag?.segment&&!gesture){updatePenHandle(drag.lastPoint||drag.start,e);refresh();}else if(tool==='pen'&&path)schedulePenPreview();}
});
canvas.addEventListener('pointerdown',e=>{hideHandleSize();e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,new paper.Point(e.offsetX,e.offsetY));if(pointers.size===2){cancelDrawingForGesture();const a=[...pointers.values()],mid=a[0].add(a[1]).divide(2);gesture={distance:a[0].getDistance(a[1]),anchor:paper.view.viewToProject(mid),zoom:paper.view.zoom};refresh();return;}if(pointers.size>1||gesture)return;const p=point(e);
if(e.button===1){viewFitted=false;drag={middlePan:true,last:p,pointerId:e.pointerId};canvas.classList.add('middle-panning');return;}
if(tool==='blob'){const diameter=$('blob-size').valueAsNumber;if(!Number.isFinite(diameter)||diameter<1||diameter>500){say('Choose a brush size from 1 to 500 px.');return;}selected=[];drag={blob:true,start:p,points:[p],diameter,smoothing:$('blob-smoothing').valueAsNumber,color:pickerColor('fill')};refresh();return;}
if(tool==='bucket'){drag={bucket:true,start:p};return;}
if(tool==='text'){const h=hit(p);if(h?.item instanceof paper.PointText){selected=[h.item];revealTextFormatting();refresh();$('text-content').focus();}else{drag={textBox:true,start:p,end:p};}return;}
if(tool==='pan'){viewFitted=false;drag={last:p};return;}
if(tool==='dropper'){overlay.visible=false;paper.view.update();try{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);drag={dropper:true,start:p,radius:0,pixels,target:$('dropper-target').value};}catch{say('Could not sample this image. Try inserting a local image file.');}finally{overlay.visible=true;}refresh();return;}
if(tool==='crop'){let item=selected.length===1&&imageParts(selected[0])?selected[0]:null;if(!item){const h=hit(p);if(h&&imageParts(h.item)){item=h.item;selected=[item];}}if(!item){say('Select an image to crop.');refresh();return;}const parts=imageParts(item),b=parts.raster.bounds.clone(),local=item.globalToLocal(p);local.x=Math.max(b.left,Math.min(b.right,local.x));local.y=Math.max(b.top,Math.min(b.bottom,local.y));drag={crop:true,item,start:p,localStart:local,box:new paper.Rectangle(local,local),imageBounds:b};refresh();return;}
if(tool==='pen'){if(penClosing(p)){path.closed=true;finish();return;}if(!path){art.activate();path=new paper.Path(style());selected=[path];$('finish').hidden=false;}const start=penPoint(p,path.lastSegment?.point,e);const s=path.add(start);drag={segment:s,start};refresh();return;}
if(tool==='nodes'){const multi=e.shiftKey||$('multi-nodes').checked;node=nodeHit(p);if(!node){const h=nodePathHit(p);if(h){const item=h.item.parent instanceof paper.CompoundPath?h.item.parent:h.item;selected=multi?[...new Set([...selected,item])]:[item];node=nodeHit(p);}if(!node){drag={nodeMarquee:true,clickedPath:!!h,start:p,end:p,previousNodes:multi?[...selectedNodes]:[]};if(!multi)selectedNodes=[];refresh();return;}}if(node){const removeOnTap=multi&&node.key==='point'&&selectedNodes.includes(node.segment);if(node.key==='point'){if(multi&&!selectedNodes.includes(node.segment))selectedNodes=[...selectedNodes,node.segment];else if(!selectedNodes.includes(node.segment))selectedNodes=[node.segment];}else if(!selectedNodes.includes(node.segment))selectedNodes=[node.segment];drag={node,removeOnTap,start:p,originalSegment:node.segment.clone(),nodeOriginals:selectedNodes.map(segment=>({segment,point:segment.point.clone()})),linked:$('linked').checked&&nodeMode(node.segment)!=='corner',symmetric:nodeMode(node.segment)==='symmetric'};}refresh();return;}
if(tool==='select'){if(selected.length&&rotationHandle(selectionBounds()).getDistance(p)<12/paper.view.zoom){beginRotation(p,e);refresh();return;}const handle=resizeHit(p);if(handle){beginResize(handle,p);refresh();return;}const h=hit(p);if(h){const removeItemOnTap=($('multi').checked||e.shiftKey)&&selected.includes(h.item)?h.item:null;if($('multi').checked||e.shiftKey){if(!selected.includes(h.item))selected=[...selected,h.item];}else if(!selected.includes(h.item))selected=[h.item];drag={start:p,removeItemOnTap,selectionMoved:false,positions:selected.map(i=>i.position.clone()),bounds:selectionBounds()};}else{const previous=($('multi').checked||e.shiftKey)?[...selected]:[];selected=previous;drag={marquee:true,start:p,end:p,previous};}refresh();return;}
art.activate();const created=new paper.Path({...style()});selected=[created];drag={start:snapPosition(p),created};refresh();});
canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)){if(tool==='pen'&&path)schedulePenPreview();return;}pointers.set(e.pointerId,new paper.Point(e.offsetX,e.offsetY));if(gesture&&pointers.size===2){viewFitted=false;const a=[...pointers.values()],mid=a[0].add(a[1]).divide(2);const anchor=gesture.anchor;paper.view.zoom=Math.max(.15,Math.min(8,gesture.zoom*a[0].getDistance(a[1])/Math.max(1,gesture.distance)));paper.view.center=paper.view.center.add(anchor.subtract(paper.view.viewToProject(mid)));requestRefresh();return;}if(!drag)return;const p=point(e);
if(drag.textBox){drag.end=p;}
else if(drag.blob){if(p.getDistance(drag.points.at(-1))>=Math.max(.5,drag.diameter/8))drag.points.push(p);}
else if(drag.dropper){drag.radius=p.getDistance(drag.start);}
else if(drag.crop){const local=drag.item.globalToLocal(p),b=drag.imageBounds;local.x=Math.max(b.left,Math.min(b.right,local.x));local.y=Math.max(b.top,Math.min(b.bottom,local.y));drag.box=new paper.Rectangle(drag.localStart,local);}
else if(drag.nodeMarquee){drag.end=p;const box=new paper.Rectangle(drag.start,p);selectedNodes=[...new Set([...drag.previousNodes,...selected.flatMap(editablePaths).flatMap(path=>path.segments).filter(segment=>box.contains(nodePosition(segment)))])];}
else if(drag.marquee){drag.end=p;const box=new paper.Rectangle(drag.start,p);selected=[...new Set([...drag.previous,...art.children.filter(item=>box.contains(item.bounds))])];}
else if(drag.rotating)updateRotation(p,e);
else if(drag.resize)updateResize(p,e);
else if(drag.middlePan||tool==='pan'){paper.view.center=paper.view.center.subtract(p.subtract(drag.last));}
else if(drag.created){const rect=drawingRectangle(p,e);say(`${drag.equalDimensions?(tool==='ellipse'?'Circle':'Square')+' · ':''}${formatLength(rect.width)} × ${formatLength(rect.height)} ${$('units').value}`);const temp=tool==='ellipse'?new paper.Path.Ellipse(rect):new paper.Path.Rectangle(rect);drag.created.segments=temp.segments.map(s=>s.clone());drag.created.closed=true;temp.remove();}
else if(drag.segment)updatePenHandle(p,e);
else if(drag.node){const {segment,key}=drag.node;if(key==='point'){const delta=snapPosition(p).subtract(drag.start);for(const o of drag.nodeOriginals)o.segment.point=o.point.add(pathVector(o.segment.path,delta));}else{const opposite=key==='handleIn'?'handleOut':'handleIn',length=segment[opposite].length;let handle=p.subtract(nodePosition(segment));if(e.ctrlKey||e.metaKey)handle.angle=Math.round(handle.angle/15)*15;segment[key]=pathVector(segment.path,handle);if(drag.linked&&segment[key].length)segment[opposite]=drag.symmetric?segment[key].negate():segment[key].normalize(-length);} }
else if(tool==='select'&&selected.length&&drag.bounds){const raw=p.subtract(drag.start);if(!drag.selectionMoved&&raw.length<3/paper.view.zoom)return;drag.selectionMoved=true;const bounds=drag.bounds.clone();bounds.point=bounds.point.add(raw);const snapped=snapPosition(p,bounds),delta=snapped.subtract(drag.start);selected.forEach((i,index)=>i.position=drag.positions[index].add(delta));spacingFeedback(selectionBounds());}
requestRefresh();});
function release(e){if(drag?.textBox){const pending=drag;drag=null;pointers.delete(e.pointerId);if(e.type!=='pointercancel'){const end=point(e),box=Math.abs(end.x-pending.start.x)>8/paper.view.zoom;addText(box?new paper.Point(Math.min(end.x,pending.start.x),Math.min(end.y,pending.start.y)):pending.start,box?Math.abs(end.x-pending.start.x):null);}return;}if(drag?.removeItemOnTap&&!drag.selectionMoved&&!gesture&&e.type==='pointerup')selected=selected.filter(i=>i!==drag.removeItemOnTap);if(drag?.middlePan){pointers.delete(e.pointerId);drag=null;canvas.classList.remove('middle-panning');refresh();return;}if(e.type==='pointercancel'&&(drag?.node||drag?.rotating||drag?.resize))cancelDrawingForGesture();if(drag?.blob){if(!gesture&&e.type!=='pointercancel'){try{const end=point(e);if(end.getDistance(drag.points.at(-1))>.01)drag.points.push(end);const result=applyBlob(art,drag.points,drag.diameter,drag.color,drag.smoothing);selected=[result.path];commit();say(result.merged?`Blob joined ${result.merged} connected path${result.merged===1?'':'s'}.`:'Blob path created.');}catch(error){say(error.message||'Could not create this blob.');}}drag=null;}if(drag?.bucket&&!gesture&&e.type!=='pointercancel'&&drag.start.getDistance(point(e))<6/paper.view.zoom){try{const fill=createBucketFill(art,drag.start,pageSize,pickerColor('fill'));art.addChild(fill);selected=[fill];commit();say('Filled enclosed area with a new path.');}catch(error){say(error.message);}drag=null;}if(drag?.dropper&&!gesture&&e.type!=='pointercancel')applyDropper(drag);if(drag?.crop&&!gesture&&e.type!=='pointercancel'&&drag.start.getDistance(point(e))>3/paper.view.zoom&&drag.box.width>0&&drag.box.height>0){const b=drag.imageBounds,c=drag.box,values={left:(c.left-b.left)/b.width*100,right:(b.right-c.right)/b.width*100,top:(c.top-b.top)/b.height*100,bottom:(b.bottom-c.bottom)/b.height*100};for(const edge in values)$(`crop-${edge}`).value=values[edge];cropImage();}if(e.pointerType==='touch'&&drag?.nodeMarquee&&drag.clickedPath&&drag.start.getDistance(point(e))<6/paper.view.zoom){const now=performance.now(),p=point(e);if(lastPathTap&&now-lastPathTap.time<400&&p.getDistance(lastPathTap.point)<20/paper.view.zoom){editDoubleClick(p);lastPathTap=null;lastTouchToggle=now;}else lastPathTap={point:p,time:now};}if((drag?.marquee||drag?.nodeMarquee)&&!(e.pointerType==='touch'&&performance.now()-lastTouchToggle<50)&&drag.start.getDistance(point(e))<3/paper.view.zoom){if(!drag.clickedPath)selected=[];selectedNodes=[];node=null;}if(drag?.removeOnTap&&drag.start.getDistance(point(e))<3/paper.view.zoom)selectedNodes=selectedNodes.filter(s=>s!==drag.node.segment);if(e.pointerType==='touch'&&drag?.node?.key==='point'&&drag.start.getDistance(point(e))<6/paper.view.zoom){const now=performance.now();if(lastNodeTap?.segment===drag.node.segment&&now-lastNodeTap.time<400){node=drag.node;toggleNode();lastNodeTap=null;lastTouchToggle=now;}else lastNodeTap={segment:drag.node.segment,time:now};}if(drag?.node&&!gesture){const {segment}=drag.node,original=drag.originalSegment;if(drag.nodeOriginals.some(o=>!o.segment.point.equals(o.point))||!segment.handleIn.equals(original.handleIn)||!segment.handleOut.equals(original.handleOut))detachNodeBuild(drag.nodeOriginals.map(o=>o.segment));}if(drag?.originals)for(const o of drag.originals){o.item.applyMatrix=o.applyMatrix;o.source?.remove();}guides=[];pointers.delete(e.pointerId);if(gesture){if(!pointers.size){gesture=null;drag=null;refresh();}return;}if(drag?.created&&drag.created.bounds.width<2&&drag.created.bounds.height<2){drag.created.remove();selected=[];}if(drag&&tool!=='pen'&&tool!=='pan'&&!drag.dropper)commit(false);drag=null;refresh();}
canvas.addEventListener('auxclick',e=>{if(e.button===1)e.preventDefault();});
canvas.addEventListener('lostpointercapture',e=>{if(drag?.middlePan&&drag.pointerId===e.pointerId)release(e);});
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
$('blob-smoothing').oninput=()=>$('blob-smoothing-value').textContent=$('blob-smoothing').value+'%';
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$('finish').onclick=finish;
$('undo').onclick=()=>{if(path){undoPenNode();return;}if(history.length>1){future.push(history.pop());restore(history.at(-1));}};$('redo').onclick=()=>{if(future.length){const s=future.pop();history.push(s);restore(s);}};
$('canvas-undo').onclick=()=>$('undo').click();$('canvas-redo').onclick=()=>$('redo').click();
for(const id of ['fill','stroke','no-fill','no-stroke'])$(id).onchange=()=>{const channel=id.replace('no-',''),picker=$(channel),checkbox=$(`no-${channel}`);if(id.startsWith('no-'))picker.setNone(checkbox.checked);else checkbox.checked=picker.none;const value=checkbox.checked?null:pickerColor(channel);(['bucket','blob'].includes(tool)?[]:selected.filter(i=>!imageParts(i))).forEach(i=>i[`${channel}Color`]=value);commit();};
$('width').onchange=()=>{const value=$('width').valueAsNumber*units[$('units').value];if(!Number.isFinite(value)||value<0||value>100000)return say('Enter a stroke width from 0 to 100,000 pixels.');selected.filter(i=>!imageParts(i)).forEach(i=>resizeStroke(i,value));commit();};
let previousUnit=$('units').value;try{const savedUnit=localStorage.getItem('vector-lab-unit');if(units[savedUnit])$('units').value=savedUnit;}catch{}previousUnit=$('units').value;$('width').value=3/units[previousUnit];
function formatLength(pixels){return Number((pixels/units[$('units').value]).toFixed(4));}
function nudgeAmount(large=false){return $('units').value==='in'?(large?1:1/8):(large?10:1);}
$('units').onchange=()=>{const pixels=Number($('width').value)*units[previousUnit];previousUnit=$('units').value;$('width').value=Number((pixels/units[previousUnit]).toFixed(8));guides=[];try{localStorage.setItem('vector-lab-unit',previousUnit);}catch{}refresh();};
function deleteNodes(){
const editable=new Set(selected.flatMap(editablePaths)),segments=[...new Set(selectedNodes)].filter(segment=>editable.has(segment.path));
if(!segments.length)return say('Select the nodes you want to delete.');
detachNodeBuild(segments);
const paths=new Set(segments.map(segment=>segment.path)),modes=new Map([...paths].filter(item=>item.data.nodeModes).map(item=>[item,new Map(item.segments.map(segment=>[segment,item.data.nodeModes[segment.index]]))]));segments.forEach(segment=>segment.remove());
// Node modes are indexed in saved SVG data; keep each mode with its surviving segment.
for(const [item,saved] of modes)item.data.nodeModes=Object.fromEntries(item.segments.map(segment=>[segment.index,saved.get(segment)]).filter(([,mode])=>mode!==undefined));
for(const item of paths)if(!item.segments.length){const parent=item.parent;item.remove();if(parent instanceof paper.CompoundPath&&!parent.children.length)parent.remove();}
selected=selected.filter(item=>item.isInserted());selectedNodes=[];node=null;lastNodeTap=null;commit();say(`Deleted ${segments.length} node${segments.length===1?'':'s'}. Undo restores them.`);
}
function deleteSelection(){if(tool==='nodes')return deleteNodes();selected.forEach(i=>i.remove());selected=[];selectedNodes=[];node=null;path=null;$('finish').hidden=true;commit();}
$('delete').onclick=deleteSelection;
$('duplicate').onclick=()=>{finish();const step=nudgeAmount()*units[$('units').value],offset=Math.max(1,Math.round(20/step))*step;selected=selected.map(i=>{const c=i.clone();c.translate([offset,offset]);return c;});commit();};
function flipSelection(horizontal){if(!selected.length)return;finish();const center=selectionBounds().center;selected.forEach(item=>item.scale(horizontal?-1:1,horizontal?1:-1,center));commit();say(horizontal?'Flipped horizontally':'Flipped vertically');}
$('flip-horizontal').onclick=()=>flipSelection(true);
$('flip-vertical').onclick=()=>flipSelection(false);
$('rotate').onclick=()=>{selected.forEach(i=>i.rotate(15));commit();};
$('grow').onclick=()=>{selected.forEach(i=>i.scale(1.1));commit();};
$('shrink').onclick=()=>{selected.forEach(i=>i.scale(1/1.1));commit();};
function stackSelection(action){const order=[...art.children];if(action==='front'||action==='back'){const picked=order.filter(i=>selected.includes(i)),rest=order.filter(i=>!selected.includes(i));art.addChildren(action==='front'?[...rest,...picked]:[...picked,...rest]);}else{const raise=action==='raise';for(let n=raise?order.length-2:1;raise?n>=0:n<order.length;raise?n--:n++){const neighbor=n+(raise?1:-1);if(selected.includes(order[n])&&!selected.includes(order[neighbor]))[order[n],order[neighbor]]=[order[neighbor],order[n]];}art.addChildren(order);}commit();}
for(const action of ['front','back','raise','lower'])$(action).onclick=()=>stackSelection(action);
function alignmentBounds(item){return $('align-bounds').value==='visible'&&item.strokeColor&&item.strokeColor.alpha>0&&item.strokeWidth>0?item.strokeBounds.clone():item.bounds.clone();}
document.querySelectorAll('[data-align]').forEach(b=>b.onclick=()=>{if(!selected.length)return say('Select a shape to align.');const reference=selected.length>1?selected.at(-1):null,bounds=reference?alignmentBounds(reference):new paper.Rectangle(0,0,pageSize.width,pageSize.height),key=b.dataset.align;selected.filter(i=>i!==reference).forEach(i=>{const r=alignmentBounds(i);let x=0,y=0;if(key==='left')x=bounds.left-r.left;if(key==='right')x=bounds.right-r.right;if(key==='center')x=bounds.center.x-r.center.x;if(key==='top')y=bounds.top-r.top;if(key==='bottom')y=bounds.bottom-r.bottom;if(key==='middle')y=bounds.center.y-r.center.y;i.translate([x,y]);});commit();say(reference?'Aligned to last-selected shape':'Aligned to page');});
document.querySelectorAll('[data-distribute]').forEach(button=>button.onclick=()=>{if(selected.length<3)return say('Select at least three shapes to distribute.');const key=button.dataset.distribute,horizontal=['left','center','right','hgap'].includes(key),axis=horizontal?'x':'y',gap=key==='hgap'||key==='vgap',start=horizontal?'left':'top',end=horizontal?'right':'bottom',size=horizontal?'width':'height',value=r=>gap?r[start]:key==='center'||key==='middle'?r.center[axis]:r[key];const items=selected.map(item=>({item,bounds:alignmentBounds(item)})).sort((a,b)=>value(a.bounds)-value(b.bounds)),first=items[0].bounds,last=items.at(-1).bounds,spacing=gap?(last[end]-first[start]-items.reduce((sum,o)=>sum+o.bounds[size],0))/(items.length-1):(value(last)-value(first))/(items.length-1);let next=first[start];items.forEach((o,index)=>{const target=gap?next:value(first)+index*spacing;if(index>0&&index<items.length-1)o.item.translate(horizontal?[target-value(o.bounds),0]:[0,target-value(o.bounds)]);next+=o.bounds[size]+spacing;});commit();say('Distributed selection');});
document.querySelectorAll('[data-boolean]').forEach(b=>b.onclick=()=>{if(['subtract','intersect'].includes(b.dataset.boolean)&&selected.length===2&&selected.some(imageParts))return combineImageShape(b.dataset.boolean);if(selected.length!==2||selected.some(i=>!(i instanceof paper.PathItem)||!i.closed))return say('Select two closed shapes to combine.');try{const items=[...selected].sort((a,b)=>a.index-b.index);const result=items[0][b.dataset.boolean](items[1],{insert:false});if(result.isEmpty()||Math.abs(result.area)<.000001){result.remove();return say('These shapes produce an empty result. Originals kept.');}result.style=items[0].style.clone();result.applyMatrix=true;result.applyMatrix=false;result.data.shapeBuild={version:1,operation:b.dataset.boolean,parts:items.map(shapeRecord)};if(!validBuild(result.data.shapeBuild)){result.remove();return say('This combination is too complex to preserve its original pieces. Originals kept.');}art.insertChild(items[0].index,result);items.forEach(i=>i.remove());selected=[result];commit();say('Shapes combined. Break Apart restores the pieces.');}catch{say('These shapes could not be combined. Undo or try simpler shapes.');}});
$('group-objects').onclick=()=>{finish();const group=groupObjects(art,selected);if(!group)return say('Select at least two objects to group.');selected=[group];setTool('select');commit();say(`Objects grouped. ${shortcutLabel(['Mod','Shift','G'])} ungroups them.`);};
$('ungroup-objects').onclick=()=>{finish();if(!selected.some(isObjectGroup))return say('Select a group to ungroup.');selected=ungroupObjects(art,selected);setTool('select');commit();say('Objects ungrouped.');};
$('break-apart').onclick=()=>{finish();const restored=[];for(const item of selected){const build=item.data.shapeBuild;if(!build){restored.push(item);continue;}const parts=build.parts.map(restoreShape);parts.forEach((part,index)=>{part.transform(item.matrix);art.insertChild(item.index+index,part);});item.remove();restored.push(...parts);}selected=restored;selectedNodes=[];commit();say('Original shapes restored. Nested combinations can be broken apart again.');};
$('smooth').onclick=toggleNode;
$('fit').onclick=fit;function zoom(n,viewPoint=null){viewFitted=false;hideHandleSize();const anchor=viewPoint&&paper.view.viewToProject(viewPoint);paper.view.zoom=Math.max(.15,Math.min(8,paper.view.zoom*n));if(anchor)paper.view.center=paper.view.center.add(anchor.subtract(paper.view.viewToProject(viewPoint)));refresh();}$('zoom-in').onclick=()=>zoom(1.25);$('zoom-out').onclick=()=>zoom(.8);
function serializeSVG(items=art,editable=true,fitSelection=false){const root=document.createElementNS('http://www.w3.org/2000/svg','svg');root.setAttribute('xmlns','http://www.w3.org/2000/svg');root.setAttribute('width',`${pageSize.width/96}in`);root.setAttribute('height',`${pageSize.height/96}in`);root.setAttribute('viewBox',`0 0 ${pageSize.width} ${pageSize.height}`);const builds=[];if(fitSelection){const children=Array.isArray(items)?items:items.children,bounds=children.reduce((box,item)=>box?box.unite(item.strokeBounds):item.strokeBounds.clone(),null);if(!bounds)throw Error('Select at least one object to export.');const copies=children.map(item=>item.clone({insert:false}));try{
// Put the actual geometry at the viewport origin. Some costume editors
// interpret path coordinates separately from a nonzero SVG viewBox.
copies.forEach(item=>item.translate(bounds.topLeft.negate()));
const doc=new DOMParser().parseFromString(serializeSVG(copies,editable,false),'image/svg+xml');
const width=Math.max(.01,bounds.width),height=Math.max(.01,bounds.height);
doc.documentElement.setAttribute('width',String(width));doc.documentElement.setAttribute('height',String(height));doc.documentElement.setAttribute('viewBox',`0 0 ${width} ${height}`);
return new XMLSerializer().serializeToString(doc);
}finally{copies.forEach(item=>item.remove());}}

const exportItem=item=>{if(item instanceof paper.PointText){const element=item.exportSVG({asString:false,precision:10});const format=textFormat(item);if(format.italic){const entry=fontLibrary.entry(item.fontFamily),weight=item.fontWeight==='bold'?entry?.bold:entry?.normal;element.setAttribute('font-style',entry?.files[weight+'i']?'italic':'oblique 12deg');}if(format.underline)element.setAttribute('text-decoration','underline');if(format.letterSpacing)element.setAttribute('letter-spacing',String(format.letterSpacing));element.textContent='';item.content.split(/\r\n|\r|\n/).forEach((line,index)=>{const span=document.createElementNS(root.namespaceURI,'tspan');span.setAttribute('x',element.getAttribute('x')||'0');span.setAttribute('dy',String(index?item.leading:0));span.textContent=line||'\u200b';element.append(span);});if(editable)element.setAttribute('data-paper-data',JSON.stringify({...item.data,textLayout:{...item.data.textLayout,source:item.data.textLayout?.source??item.content,width:item.data.textLayout?.width||0,rendered:item.content,leading:item.leading}}));else element.removeAttribute('data-paper-data');return element;}if(isObjectGroup(item)){const element=document.createElementNS(root.namespaceURI,'g');if(!item.matrix.isIdentity())element.setAttribute('transform',`matrix(${item.matrix.values.join(',')})`);if(item.opacity!==1)element.setAttribute('opacity',String(item.opacity));if(!item.visible)element.setAttribute('visibility','hidden');if(editable&&Object.keys(item.data).length)element.setAttribute('data-paper-data',JSON.stringify(item.data));item.children.forEach(child=>element.append(exportItem(child)));return element;}if(!editable||!item.data.shapeBuild){const element=item.exportSVG({asString:false,precision:10,matchShapes:false});if(!editable)for(const node of [element,...element.querySelectorAll('*')])node.removeAttribute('data-paper-data');return element;}const copy=item.clone({insert:false});try{const build=transformedBuild(copy.data.shapeBuild,copy.matrix);delete copy.data.shapeBuild;copy.applyMatrix=true;const element=copy.exportSVG({asString:false}),id=`vector-lab-build-${builds.length}`;element.setAttribute('id',id);builds.push({id,build});return element;}finally{copy.remove();}};
const children=Array.isArray(items)?items:items.children;children.forEach(item=>root.append(exportItem(item)));if(builds.length){const metadata=document.createElementNS(root.namespaceURI,'metadata');metadata.setAttribute('id','vector-lab-shape-building');metadata.textContent=JSON.stringify({version:1,shapes:builds});root.prepend(metadata);}return new XMLSerializer().serializeToString(root);}
function parseLength(value){const m=value?.trim().match(/^([\d.]+)\s*(in|mm|px|pt|cm)?$/);return m?Number(m[1])*(m[2]==='cm'?96/2.54:units[m[2]||'px']):null;}
function inlineSVGStyles(text){
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');
  if(doc.querySelector('parsererror'))throw Error('Could not read SVG.');
  const root=doc.documentElement,rules=[];
  for(const style of doc.querySelectorAll('style')){
    if(/@import|url\s*\(/i.test(style.textContent))throw Error('External SVG styles are not supported.');
    const sheet=new CSSStyleSheet();sheet.replaceSync(style.textContent);
    for(const rule of sheet.cssRules){
      if(rule.type!==1)throw Error('This SVG stylesheet needs image fallback.');
      for(const selector of rule.selectorText.split(',')){
        // Support ordinary type, class, and ID selectors without changing cascade order.
        if(!/^[\w.#*\s>+~-]+$/.test(selector))throw Error('This SVG selector needs image fallback.');
        const specificity=(selector.match(/#/g)||[]).length*100+(selector.match(/\./g)||[]).length*10+(selector.match(/(?:^|[\s>+~])\w/g)||[]).length;
        rules.push({selector,style:rule.style,specificity});
      }
    }
    style.remove();
  }
  const original=new Map([...root.querySelectorAll('*'),root].map(node=>[node,node.getAttribute('style')||'']));
  rules.sort((a,b)=>a.specificity-b.specificity);
  const allowed=/^(fill|fill-opacity|fill-rule|stroke|stroke-width|stroke-opacity|stroke-linecap|stroke-linejoin|stroke-dasharray|stroke-dashoffset|opacity|font-family|font-size|font-weight|font-style|text-anchor|letter-spacing|visibility|display)$/;
  for(const rule of rules)for(const node of [root,...root.querySelectorAll('*')].filter(node=>node.matches(rule.selector))){
    for(const name of rule.style){if(!allowed.test(name))throw Error('This SVG style needs image fallback.');node.style.setProperty(name,rule.style.getPropertyValue(name),rule.style.getPropertyPriority(name));}
  }
  for(const [node,value] of original){if(value){const inline=document.createElement('span');inline.setAttribute('style',value);for(const name of inline.style)node.style.setProperty(name,inline.style.getPropertyValue(name),inline.style.getPropertyPriority(name));}}
  return new XMLSerializer().serializeToString(root);
}
function parseSVG(text){if(text.length>30e6)throw Error('Please use an SVG smaller than 30 MB.');const doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=doc.documentElement;if(doc.querySelector('parsererror')||root.localName!=='svg')throw Error('Could not read this SVG.');if(doc.querySelector('script,foreignObject,use,style')||[root,...doc.querySelectorAll('*')].some(el=>[...el.attributes].some(a=>/^on/i.test(a.name)||(/href/i.test(a.name)&&!(el.localName==='image'&&/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(a.value)))||(/url\s*\(/i.test(a.value)&&!/^url\(#[\w-]+\)$/.test(a.value)))))throw Error('Use SVGs with embedded PNG/JPEG/WebP/GIF images and no external links or code.');
const builds=new Map(),metadata=root.querySelector('metadata#vector-lab-shape-building');if(metadata){try{const saved=JSON.parse(metadata.textContent);if(saved.version!==1||!Array.isArray(saved.shapes)||saved.shapes.length>2048)throw Error();for(const entry of saved.shapes){if(typeof entry.id!=='string'||builds.has(entry.id)||!validBuild(entry.build))throw Error();builds.set(entry.id,entry.build);}}catch{throw Error('This SVG has invalid reversible shape data.');}metadata.remove();}
const vb=root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number),valid=vb?.length===4&&vb.every(Number.isFinite)&&vb[2]>0&&vb[3]>0;
const width=parseLength(root.getAttribute('width'))||(valid?vb[2]:DEFAULT_PAGE.width),height=parseLength(root.getAttribute('height'))||(valid?vb[3]:DEFAULT_PAGE.height);
if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>100000||height>100000)throw Error('SVG page dimensions are not supported.');
// Normalize SVG physical units before Paper imports; flatten artwork, excluding viewport masks.
root.setAttribute('width',String(valid?vb[2]:width));root.setAttribute('height',String(valid?vb[3]:height));root.setAttribute('overflow','visible');art.activate();const group=paper.project.importSVG(root,{insert:false,expandShapes:true,applyMatrix:false,onImport(node,item){if(node.getAttribute?.('visibility')==='hidden'||node.style?.visibility==='hidden')item.visible=false;}});if(!group)throw Error('Could not open this SVG.');if(valid)group.scale(width/vb[2],height/vb[3],new paper.Point(0,0));const items=[];
function restoreGroupedBuilds(item){
if(item instanceof paper.PointText)restoreTextLayout(item);
const build=builds.get(item.name);delete item.data.shapeBuild;
if(build&&item instanceof paper.PathItem){item.data.shapeBuild=transformedBuild(build,item.matrix);item.applyMatrix=true;item.applyMatrix=false;}
else if(item instanceof paper.Group){
item.applyMatrix=false;[...item.children].forEach(restoreGroupedBuilds);
// Paper may wrap a clipped SVG image in an extra, unmarked group. Remove
// that wrapper so ungrouping restores the image's own crop/trace controls.
if(!item.clipped&&!item.data.objectGroup&&item.children.length===1&&item.opacity===1&&item.visible&&item.blendMode==='normal'){
const child=item.firstChild,matrix=item.matrix.appended(child.matrix);child.applyMatrix=false;child.matrix=matrix;item.replaceWith(child);
}
}
}
function flatten(item){if(item instanceof paper.PointText)restoreTextLayout(item);if(item.clipMask)return;const matrix=item.globalMatrix.clone();if(item instanceof paper.Group&&item.clipped&&item.getItems({class:paper.Raster}).length){item.data.image=true;delete item.data.shapeBuild;item.remove();item.matrix=matrix;items.push(item);}else if(isObjectGroup(item)&&(item.data.objectGroup===true||item.opacity!==1||!item.visible)){item.data.objectGroup=true;restoreGroupedBuilds(item);item.remove();item.applyMatrix=false;item.matrix=matrix;items.push(item);}else if(item instanceof paper.Group){for(const child of [...item.children])flatten(child);}else{const build=builds.get(item.name);item.remove();item.applyMatrix=false;item.matrix=matrix;if(build&&item instanceof paper.PathItem){item.data.shapeBuild=transformedBuild(build,matrix);item.applyMatrix=true;item.applyMatrix=false;}else{delete item.data.shapeBuild;item.applyMatrix=!item.data.cornerEffect;}items.push(item);}}flatten(group);group.remove();return {items,page:{width,height}};}
let exportRevision=0,preparedURL=null,preparedSVGFile=null,shareBusy=false;
let drawingName='vector-lab';try{drawingName=localStorage.getItem('vector-lab-name')||drawingName;}catch{}
function setDrawingName(value){drawingName=svgFilename(value).replace(/\.svg$/i,'');$('svg-filename').value=drawingName;browserRecovery?.save(snapshot(),drawingName);}
function updateExportActions(){
const ready=!!preparedSVGFile,supported=ready&&canShareSVG(preparedSVGFile);
$('download-svg').disabled=!ready||shareBusy;$('download-svg').classList.toggle('primary',!supported);$('share-svg').hidden=!supported;$('share-svg').disabled=!ready||shareBusy;
$('svg-filename').disabled=shareBusy;$('vector-text').disabled=shareBusy;$('export-selected').disabled=shareBusy||!selected.some(item=>item.isInserted());
$('share-help').hidden=!ready||supported;$('share-help').textContent='To share from this browser, download the SVG, then use Share in Files.';
}
function clearPreparedExport(){if(preparedURL)URL.revokeObjectURL(preparedURL);preparedURL=null;preparedSVGFile=null;$('prepared-svg').removeAttribute('href');updateExportActions();}
function updateExportName(){
const filename=svgFilename($('svg-filename').value);$('prepared-svg').download=filename;
if(preparedSVGFile)preparedSVGFile=new File([preparedSVGFile],filename,{type:'image/svg+xml'});
updateExportActions();
}
$('svg-filename').addEventListener('input',updateExportName);
$('svg-filename').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setDrawingName($('svg-filename').value);updateExportName();$($('share-svg').hidden?'download-svg':'share-svg').focus({preventScroll:true});}});
$('svg-filename').addEventListener('change',()=>{setDrawingName($('svg-filename').value);updateExportName();});
async function prepareExport(){const revision=++exportRevision;clearPreparedExport();const button=$('download-svg'),status=$('export-status');button.textContent='Preparing…';status.classList.remove('export-error');status.textContent=$('vector-text').checked?'Converting artwork to simple paths…':'Preparing editable SVG…';try{const onlySelected=$('export-selected').checked,items=onlySelected?selected.filter(item=>item.isInserted()):art;if(onlySelected&&!items.length)throw Error('Select at least one object to export.');const texts=Array.isArray(items)?items.flatMap(item=>item instanceof paper.PointText?[item]:item.getItems({class:paper.PointText})):items.getItems({class:paper.PointText});await fontLibrary.ready;await Promise.all(texts.filter(item=>fontLibrary.has(item.fontFamily)).map(item=>fontLibrary.ensure(item.fontFamily,item.fontWeight==='bold'||Number(item.fontWeight)>=600,textFormat(item).italic)));texts.forEach(item=>item.content=item.content);const svg=$('vector-text').checked?await vectorSVG(items,onlySelected):serializeSVG(items,true,onlySelected);if(revision!==exportRevision||!$('export-dialog').open)return;preparedSVGFile=new File([svg],svgFilename($('svg-filename').value),{type:'image/svg+xml'});preparedURL=URL.createObjectURL(preparedSVGFile);$('prepared-svg').href=preparedURL;updateExportName();button.textContent='Download SVG';status.textContent='Ready to save or share.';}catch(error){if(revision!==exportRevision||!$('export-dialog').open)return;button.textContent='Download SVG';status.classList.add('export-error');status.textContent=(error.message||'Could not export text.')+' Uncheck simple paths to save an editable SVG.';}}
$('save').onclick=()=>{finish();$('export-selected').checked=false;$('export-selection-help').textContent=selected.length?`Fits the SVG page to ${selected.length} selected object${selected.length===1?'':'s'}.`:'Select artwork first to export selected objects.';$('svg-filename').value=drawingName;$('export-dialog').showModal();prepareExport();};
$('vector-text').onchange=prepareExport;$('export-selected').onchange=prepareExport;
$('download-svg').onclick=()=>{if(!preparedURL||shareBusy)return;setDrawingName($('svg-filename').value);updateExportName();$('prepared-svg').click();const url=preparedURL;preparedURL=null;$('export-dialog').close();setTimeout(()=>URL.revokeObjectURL(url),60000);say('SVG download started. Keep it in Files to open again.');};
$('share-svg').onclick=async()=>{
if(!preparedSVGFile||shareBusy)return;setDrawingName($('svg-filename').value);updateExportName();const file=preparedSVGFile,revision=exportRevision;
shareBusy=true;updateExportActions();$('export-status').textContent='Choose where to share your SVG…';
try{await navigator.share({files:[file],title:drawingName});if(revision===exportRevision&&$('export-dialog').open){$('export-dialog').close();say('SVG shared.');}}
catch(error){if(revision===exportRevision&&$('export-dialog').open){$('export-status').classList.toggle('export-error',error.name!=='AbortError');$('export-status').textContent=error.name==='AbortError'?'Sharing cancelled. Your SVG is still ready.':'Sharing could not start. You can still download the SVG and share it from Files.';}}
finally{shareBusy=false;updateExportActions();}
};
$('export-dialog').addEventListener('close',()=>{++exportRevision;clearPreparedExport();});
let editablePNGExport=false;
async function downloadPNG(editable=false){
const button=$('download-png');if(button.disabled)return;
finish();button.disabled=true;const onlySelected=$('png-export-selected').checked,items=onlySelected?selected.filter(item=>item.isInserted()):art,name=svgFilename(drawingName).replace(/\.svg$/i,'.png');$('png-export-status').textContent='Preparing PNG…';
try{
if(onlySelected&&!items.length)throw Error('Select at least one object to export.');
const svg=editable?serializeSVG(items,true,onlySelected):null;
const rendered=await vectorSVG(items,onlySelected),root=new DOMParser().parseFromString(rendered,'image/svg+xml').documentElement,viewBox=root.getAttribute('viewBox').split(/\s+/).map(Number),width=viewBox[2],height=viewBox[3];
let blob=await createPNG(rendered,width,height);if(editable)blob=await embedEditableSVG(blob,svg);
const url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
$('png-export-dialog').close();
say(`PNG download started · ${Math.max(1,Math.round(width))} × ${Math.max(1,Math.round(height))} pixels · transparent background.`);
}catch(error){$('png-export-status').textContent=error.message||'Could not export this drawing as PNG.';}finally{button.disabled=false;}
}
function openPNGExport(editable=false){finish();editablePNGExport=editable;$('png-export-title').textContent=editable?'Export editable PNG':'Export PNG';$('png-export-selected').checked=false;$('png-export-selected').disabled=!selected.some(item=>item.isInserted());$('png-selection-help').textContent=selected.length?'Fits the PNG to the selected objects, including outlines.':'Select artwork first to export selected objects.';$('png-export-status').textContent='Transparent background'+(editable?' · Includes editable artwork.':'.');$('png-export-dialog').showModal();}
$('export-png').onclick=()=>openPNGExport();
$('export-editable-png').onclick=()=>openPNGExport(true);
$('download-png').onclick=()=>downloadPNG(editablePNGExport);
$('open').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const imported=parseSVG(await file.text());if(!confirm('Replace this drawing with the selected SVG? Save your current SVG first if needed.'))return;setDrawingName(file.name);art.removeChildren();pageSize=imported.page;imported.items.forEach(i=>art.addChild(i));selected=[];path=null;node=null;$('finish').hidden=true;commit();fit();canvas.focus({preventScroll:true});say('SVG opened. Select a shape to edit.');ensureDocumentFonts();}catch(error){say(error.message);}};
$('new').onclick=()=>{if(art.children.length&&!confirm('Start a new drawing? Save your SVG first if you want to keep this one.'))return;setDrawingName('vector-lab');art.removeChildren();pageSize={...DEFAULT_PAGE};selected=[];path=null;node=null;$('finish').hidden=true;commit();fit();};
function editingText(e){return e.target.closest('input,textarea,select,[contenteditable="true"]');}
function copySelection(e,cut=false){if(editingText(e)||!selected.length||drag)return;finish();clipboard=selected.map(i=>i.exportJSON({asString:true,precision:15}));pasteCount=0;e.preventDefault();e.clipboardData.setData('text/plain',serializeSVG(selected));if(cut){selected.forEach(item=>item.remove());selected=[];selectedNodes=[];node=null;commit();}say(cut?'Cut selection':'Copied selection');}
window.addEventListener('copy',e=>copySelection(e));window.addEventListener('cut',e=>copySelection(e,true));
window.addEventListener('paste',e=>{if(editingText(e)||drag||document.querySelector('dialog[open]'))return;const images=[...e.clipboardData.items].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(images.length){e.preventDefault();insertImages(images);return;}const text=e.clipboardData.getData('text/plain');if(!text.trim()&&!clipboard.length)return;e.preventDefault();try{finish();let items;if(text.trim()){items=parseSVG(text).items;}else items=clipboard.map(s=>paper.Base.importJSON(s));pasteCount++;selected=items;for(const item of items){art.addChild(item);item.translate([20*pasteCount,20*pasteCount]);}setTool('select');commit();say('Pasted selection');ensureDocumentFonts();}catch(error){say(error.message);}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!editingText(e)&&!document.querySelector('dialog[open]')){e.preventDefault();cancelPen();if(drag?.textBox)drag=null;selected=[];selectedNodes=[];node=null;hideHandleSize();refresh();return;}if(editingText(e)||drag||document.querySelector('dialog[open]'))return;const key=e.key.toLowerCase(),cmd=e.ctrlKey||e.metaKey;if(cmd&&!e.altKey&&!e.isComposing&&(['[',']','{','}'].includes(e.key)||['BracketLeft','BracketRight'].includes(e.code))){e.preventDefault();const forward=e.code==='BracketRight'||[']','}'].includes(e.key);if(selected.length){finish();$(e.shiftKey?(forward?'front':'back'):(forward?'raise':'lower')).click();}return;}if(!cmd&&!e.altKey&&!e.isComposing&&!e.repeat&&!document.querySelector('dialog[open]')&&toolShortcuts[key]){e.preventDefault();setTool(toolShortcuts[key]);canvas.focus({preventScroll:true});return;}if(!cmd&&!e.altKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selected.length){e.preventDefault();finish();selected=selected.filter(i=>i.isInserted());const amount=nudgeAmount(e.shiftKey),step=amount*units[$('units').value],delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];if(tool==='nodes'&&selectedNodes.length){detachNodeBuild(selectedNodes);selectedNodes.forEach(s=>s.point=s.point.add(pathVector(s.path,new paper.Point(delta))));}else selected.forEach(i=>i.translate(delta));commit();say(`Moved ${amount} ${$('units').value}`);}else if(!cmd&&!e.altKey&&(key==='-'||key==='='||key==='+')){e.preventDefault();zoom(key==='-'?.8:1.25,cursorViewPoint());}else if(cmd&&key==='a'){e.preventDefault();finish();if(tool==='nodes'){if(!selected.length)selected=[...art.children];selectedNodes=selected.flatMap(editablePaths).flatMap(p=>p.segments);}else{setTool('select');selected=[...art.children];}refresh();}else if(cmd&&key==='g'&&!e.altKey){e.preventDefault();if(!e.repeat&&!e.isComposing)$(e.shiftKey?'ungroup-objects':'group-objects').click();}else if(cmd&&key==='d'){e.preventDefault();$('duplicate').click();}else if(cmd&&key==='s'){e.preventDefault();$('save').click();}else if(cmd&&(key==='z'||key==='y')){e.preventDefault();(key==='y'||e.shiftKey?$('redo'):$('undo')).click();}else if(e.key==='Enter')finish();else if(e.key==='Delete'||e.key==='Backspace'){deleteSelection();e.preventDefault();}});
var dimensionSignature;
function updateDimensions(){if(lastDimensionsEnabled!==dimensionsEnabled){lastDimensionsEnabled=dimensionsEnabled;$('dimension-controls').hidden=!dimensionsEnabled;$('dimensions-toggle').classList.toggle('active',dimensionsEnabled);$('dimensions-toggle').setAttribute('aria-pressed',String(dimensionsEnabled));$('dimensions-toggle').setAttribute('aria-expanded',String(dimensionsEnabled));}if(!drag?.created){const hidden=tool==='blob'||!selected.some(i=>i.isInserted());if($('selection-dimensions').hidden!==hidden)$('selection-dimensions').hidden=hidden;}if(!dimensionsEnabled&&!$('settings-dialog').open)return;const signature=JSON.stringify([selected.map(i=>i.id),selectionBounds()?.toString(),pageSize,$('units').value]);if(signature!==dimensionSignature){dimensionSignature=signature;document.querySelectorAll('[data-pending]').forEach(input=>{delete input.dataset.pending;});}for(const axis of ['width','height']){const input=$(`page-${axis}`);if(!input.dataset.pending)input.value=formatLength(pageSize[axis]);}if(!document.getElementById('units'))return;const bounds=$('dimension-target').value==='page'?pageSize:selectionBounds(),factor=units[$('units').value];for(const axis of ['width','height']){const input=$(`dimension-${axis}`);input.disabled=!bounds;if(!input.dataset.pending)input.value=bounds?Number((bounds[axis]/factor).toFixed(3)):'';}const selection=selectionBounds(),isPage=$('dimension-target').value==='page';for(const axis of ['x','y']){const input=$(`position-${axis}`);input.disabled=isPage||!selection;if(!input.dataset.pending)input.value=isPage?0:selection?Number((selection[axis]/factor).toFixed(3)):'';}$('apply-position').disabled=isPage||!selection;for(const id of ['position-x','position-y','dimension-width','dimension-height','page-width','page-height']){const input=$(id);if(!input.dataset.pending)input.dataset.actual=input.value;input.classList.toggle('pending',!!input.dataset.pending);}}
$('apply-position').onclick=()=>{const bounds=selectionBounds();if(!bounds)return say('Select artwork to set its position.');const fields=[$('position-x'),$('position-y')],factor=units[$('units').value],values=fields.map((input,index)=>input.dataset.pending||input.value!==input.dataset.actual?input.valueAsNumber*factor:index?bounds.top:bounds.left);if(values.some(n=>!Number.isFinite(n)||Math.abs(n)>100000))return say('Enter valid X and Y positions within ±100,000 pixels.');if($('dimension-target').value==='page')return;finish();const delta=new paper.Point(values[0]-bounds.left,values[1]-bounds.top);selected.forEach(i=>i.translate(delta));commit();say('Position applied');};
$('dimension-target').onchange=updateDimensions;
function applyDimensionAxis(axis){const field=$(`dimension-${axis}`);if(!field.dataset.pending&&field.value===field.dataset.actual)return;const factor=units[$('units').value],value=field.valueAsNumber*factor;if(!Number.isFinite(value)||value<=0||value>100000)return say(`Enter a positive ${axis} up to 100,000 pixels.`);finish();if($('dimension-target').value==='page'){pageSize={...pageSize,[axis]:value};commit();fit();}else{const b=selectionBounds();if(!b||b.width<.001||b.height<.001)return say('Select artwork with a nonzero width and height.');const scale=value/b[axis],sx=axis==='width'?scale:1,sy=axis==='height'?scale:1,m=new paper.Matrix(sx,0,0,sy,b.left*(1-sx),b.top*(1-sy));selected.forEach(i=>i.transform(m));commit();}delete field.dataset.pending;field.dataset.actual=field.value;say(`${axis==='width'?'Width':'Height'} applied`);updateDimensions();}
for(const axis of ['width','height']){const field=$(`dimension-${axis}`);field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyDimensionAxis(axis);}});field.addEventListener('blur',()=>{if(field.dataset.pending)applyDimensionAxis(axis);});}


function applyDropper(sample){const {width,height,data}=sample.pixels,scale=width/paper.view.viewSize.width,center=paper.view.projectToView(sample.start).multiply(scale),radius=sample.radius*paper.view.zoom*scale;const pageStart=paper.view.projectToView(new paper.Point(0,0)).multiply(scale),pageEnd=paper.view.projectToView(new paper.Point(pageSize.width,pageSize.height)).multiply(scale);const pointSample=radius<2*scale,r=pointSample?0:radius,minX=Math.max(0,Math.floor(center.x-r),Math.ceil(pageStart.x-.5)),maxX=Math.min(width-1,Math.floor(center.x+r),Math.ceil(pageEnd.x-.5)-1),minY=Math.max(0,Math.floor(center.y-r),Math.ceil(pageStart.y-.5)),maxY=Math.min(height-1,Math.floor(center.y+r),Math.ceil(pageEnd.y-.5)-1);let red=0,green=0,blue=0,count=0;for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){if(!pointSample&&(x+.5-center.x)**2+(y+.5-center.y)**2>r*r)continue;const i=(y*width+x)*4,alpha=data[i+3]/255;red+=data[i]*alpha+255*(1-alpha);green+=data[i+1]*alpha+255*(1-alpha);blue+=data[i+2]*alpha+255*(1-alpha);count++;}if(!count)return say('Sample inside the artboard.');const hex='#'+[red,green,blue].map(v=>Math.round(v/count).toString(16).padStart(2,'0')).join('');$(sample.target).setColor(hex,1);$(sample.target).setNone(false);$(`no-${sample.target}`).checked=false;const color=pickerColor(sample.target);selected.filter(i=>!imageParts(i)).forEach(i=>i[`${sample.target}Color`]=color.clone());commit();say(`Sampled ${hex} → ${sample.target==='fill'?'fill':'outline'}`);}

function imageParts(item){if(item instanceof paper.Group&&item.clipped){const raster=item.getItems({class:paper.Raster})[0],mask=item.children.find(c=>c.clipMask);if(raster&&mask)return {raster,mask};}return null;}
let cropSelection=null;
function syncCrop(){const item=selected.length===1?selected[0]:null,parts=imageParts(item);$('image-crop').hidden=!parts;if(item!==cropSelection){cropSelection=item;if(parts){const values=item.data.crop||{left:0,right:0,top:0,bottom:0};for(const edge of ['left','right','top','bottom'])$(`crop-${edge}`).value=values[edge];}}}
function cropImage(reset=false){const item=selected.length===1?selected[0]:null,parts=imageParts(item);if(!parts)return say('Select one image to crop.');const values=Object.fromEntries(['left','right','top','bottom'].map(edge=>[edge,reset?0:$(`crop-${edge}`).valueAsNumber]));if(Object.values(values).some(v=>!Number.isFinite(v)||v<0||v>=100)||values.left+values.right>=100||values.top+values.bottom>=100)return say('Crop values must leave some image visible.');const b=parts.raster.bounds;const box=new paper.Rectangle(b.x+b.width*values.left/100,b.y+b.height*values.top/100,b.width*(1-(values.left+values.right)/100),b.height*(1-(values.top+values.bottom)/100));let replacement=new paper.Path.Rectangle({rectangle:box,insert:false});for(const [operation,shapes] of [['subtract',item.data.cutouts||[]],['intersect',item.data.intersections||[]]])for(const saved of shapes){const cutter=paper.Base.importJSON(saved);cutter.remove();cutter.transform(parts.raster.matrix);const result=replacement[operation](cutter,{insert:false});replacement.remove();cutter.remove();replacement=result;}replacement.clipMask=true;parts.mask.replaceWith(replacement);item.data.crop=values;cropSelection=null;commit();say(reset?'Full image restored':'Image cropped');}
$('start-crop').onclick=()=>setTool('crop');
const backgroundButton=document.createElement('button');backgroundButton.id='remove-background';backgroundButton.textContent='Background';backgroundButton.title='Remove background';backgroundButton.setAttribute('aria-label','Remove background');$('image-crop').append(backgroundButton);
backgroundButton.onclick=installBackgroundRemoval({
getImage(){finish();const item=selected.length===1?selected[0]:null,parts=imageParts(item);return parts?{item,raster:parts.raster,canvas:parts.raster.canvas}:null;},
apply(session,canvas){
if(!session.item.isInserted())return;
const parts=imageParts(session.item);if(!parts)return;
const bounds=alphaBounds(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height));
if(bounds){
// Crop the mask, not the raster: keep image pixels, transforms and placement.
const crop=new paper.Path.Rectangle({rectangle:new paper.Rectangle(bounds.left-canvas.width/2,bounds.top-canvas.height/2,bounds.right-bounds.left,bounds.bottom-bounds.top),insert:false});
crop.transform(parts.raster.matrix);
const b=parts.raster.bounds,box=crop.bounds,previous=session.item.data.crop||{left:0,right:0,top:0,bottom:0};
const replacement=parts.mask.intersect(crop,{insert:false});crop.remove();
if(!replacement.isEmpty()&&Math.abs(replacement.area)>1e-8){
replacement.clipMask=true;parts.mask.replaceWith(replacement);
session.item.data.crop={left:Math.max(previous.left,(box.left-b.left)/b.width*100),right:Math.max(previous.right,(b.right-box.right)/b.width*100),top:Math.max(previous.top,(box.top-b.top)/b.height*100),bottom:Math.max(previous.bottom,(b.bottom-box.bottom)/b.height*100)};
}else replacement.remove();
}
session.raster.setImage(canvas);cropSelection=null;commit();say(bounds?'Background removed and empty edges cropped. Undo restores the image.':'Background removed. No visible pixels remain. Undo restores the image.');
},say
});
const traceButton=document.createElement('button');traceButton.id='trace-image';traceButton.textContent='Trace';traceButton.title='Trace image to editable paths';traceButton.setAttribute('aria-label','Trace image');$('image-crop').append(traceButton);
traceButton.onclick=installImageTracing({
getImage(){
finish();const item=selected.length===1?selected[0]:null;if(!imageParts(item))return null;
let copy,raster;
try{
// Sample in the image group's coordinates, including the clip and pixel alpha.
// Baking the final transform into the paths keeps SVGs free of image masks.
copy=item.clone({insert:false});copy.matrix.reset();
const bounds=copy.strokeBounds,span=Math.max(Math.ceil(bounds.right)-Math.floor(bounds.left),Math.ceil(bounds.bottom)-Math.floor(bounds.top));
if(!Number.isFinite(span)||span<=0)throw Error('This image has no visible area to trace.');
raster=copy.rasterize({resolution:72*768/span,insert:false});
const canvas=raster.canvas,image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
const matrix=item.globalMatrix.appended(raster.matrix).translate(-canvas.width/2,-canvas.height/2);
return {item,image,matrix,artworkWidth:Math.hypot(matrix.a,matrix.b)*image.width,artworkHeight:Math.hypot(matrix.c,matrix.d)*image.height};
}finally{raster?.remove();copy?.remove();}
},
apply(session,result){
if(!session.item.isInserted())throw Error('Select the image again to trace it.');
const matrix=session.matrix.clone().scale(session.image.width/result.width,session.image.height/result.height),paths=[];
try{
for(const shape of result.shapes){
const children=(shape.segments||shape.contours).map(segments=>new paper.Path({segments,closed:true,insert:false}));
const path=new paper.CompoundPath({children,insert:false}).reduce();
// A reduced single path does not inherit its former compound's style.
path.fillColor=shape.fill;path.strokeColor=null;path.fillRule='nonzero';
path.applyMatrix=true;path.transform(matrix);paths.push(path);
}
const index=session.item.index;paths.forEach((path,i)=>art.insertChild(index+i,path));session.item.remove();selected=paths;setTool('select');commit();say(`Image traced to ${result.nodes} nodes in ${paths.length} editable path${paths.length===1?'':'s'}. Undo restores the image.`);
}catch(error){paths.forEach(path=>path.remove());throw error;}
},say
});
$('apply-crop').onclick=()=>cropImage();$('reset-crop').onclick=()=>cropImage(true);
function choosePNGImport(){const dialog=$('png-import-dialog');dialog.returnValue='cancel';return new Promise(resolve=>{dialog.addEventListener('close',()=>resolve(dialog.returnValue),{once:true});dialog.showModal();});}
async function insertImages(files){finish();try{const added=[];for(const file of files){if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP, or GIF image.');if(file.size>15e6)throw Error('Please use images smaller than 15 MB.');if(file.type==='image/png'){const svg=await readEditableSVG(file);if(svg){let imported;try{imported=parseSVG(svg);}catch{}if(imported){const choice=await choosePNGImport();if(choice==='editable'){imported.items.forEach(item=>{art.addChild(item);added.push(item);});ensureDocumentFonts();continue;}if(choice!=='image')continue;}}}const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read image.'));reader.readAsDataURL(file);});const image=new Image();image.src=source;await image.decode();const raster=new paper.Raster({image,insert:false});const scale=Math.min(1,pageSize.width*.7/raster.width,pageSize.height*.7/raster.height);raster.scale(scale);const mask=new paper.Path.Rectangle({rectangle:raster.bounds,insert:false});mask.clipMask=true;const group=new paper.Group({children:[mask,raster],insert:false});group.data.image=true;group.applyMatrix=false;group.position=new paper.Point(pageSize.width/2+added.length*20,pageSize.height/2+added.length*20);art.addChild(group);added.push(group);}selected=added;setTool('select');commit();say(added.length?(added.every(imageParts)?'Image inserted. Crop controls are above the canvas.':'Inserted. Select an object to edit.'):'Import cancelled.');}catch(error){commit();say(error.message||'Could not decode image.');}}
$('insert-image').onclick=()=>$('image-file').click();$('image-file').onchange=e=>{const files=[...e.target.files];e.target.value='';if(files.length)insertImages(files);};

var preserveDimensionViewUntil=0;
paper.view.onResize=e=>{if(!viewFitted||drag||gesture||document.activeElement?.matches('input[inputmode=decimal],#dimension-controls input,#dimension-labels input,#handle-size input,#page-settings input')||Date.now()<preserveDimensionViewUntil||document.getElementById('handle-size')&&!$('handle-size').hidden){paper.view.center=paper.view.center.subtract(e.delta.divide(2*paper.view.zoom));refresh();const editor=document.getElementById('handle-size');if(editor&&!editor.hidden){editor.style.left=`${Math.max(4,Math.min(parseFloat(editor.style.left)||4,$('stage').clientWidth-editor.offsetWidth-4))}px`;editor.style.top=`${Math.max(4,Math.min(parseFloat(editor.style.top)||4,$('stage').clientHeight-editor.offsetHeight-4))}px`;}return;}fit();};fit();
let recoveredBrowserData,recoveredBrowserName;
function recoverBrowserDrawing(){
  try{
    const saved=recoveredBrowserData=localStorage.getItem('vector-lab');
    if(saved){selected=[];selectedNodes=[];art.removeChildren();art.importJSON(saved);art.getItems({class:paper.PointText}).forEach(migrateTextFont);pageSize={...(art.data.page||DEFAULT_PAGE)};say('Previous drawing recovered.');}
    recoveredBrowserName=localStorage.getItem('vector-lab-name');
    drawingName=recoveredBrowserName||'vector-lab';
  }catch{say('Recovery unavailable. Save your SVG regularly.');}
  history=[snapshot()];fit();
  return {snapshot:history[0],name:drawingName};
}
const initialRecoveryState=window.handoutVectorLab ? {snapshot:snapshot(),name:drawingName} : recoverBrowserDrawing();
browserRecovery=createBrowserRecovery({onState:({mode,dirty})=>{
  const messages={checking:'Checking browser recovery…',saved:'Saved in this browser',paused:dirty?'Changes aren’t saved in this browser—Save SVG to keep them.':'Local autosave paused—another tab is using browser recovery.',unavailable:'Browser recovery unavailable—Save SVG to keep your work.'};
  $('recovery-status').textContent=messages[mode];
  $('browser-recovery').dataset.state=mode;
  $('take-over-recovery').hidden=mode!=='paused';
}});
$('take-over-recovery').onclick=async()=>{
  if(!confirm('Use this tab for browser recovery? This replaces the existing recovery copy with this drawing and pauses local autosave in the other tab. Save an SVG from that tab first if you need to keep its work.'))return;
  $('take-over-recovery').disabled=true;
  $('take-over-recovery').textContent='Waiting for the other tab…';
  await browserRecovery.takeOver();
  $('take-over-recovery').textContent='Use this tab for recovery';
  $('take-over-recovery').disabled=false;
};


new ResizeObserver(()=>{const r=$('stage').getBoundingClientRect(),size=paper.view.viewSize;if(Math.abs(r.width-size.width)>.5||Math.abs(r.height-size.height)>.5)paper.view.viewSize=new paper.Size(r.width,r.height);}).observe($('stage'));

var textSelection,textApplyRevision=0;

function revealTextFormatting(){openPanel('style');if(matchMedia('(max-width:700px), (max-height:500px) and (orientation:landscape)').matches&&!document.body.classList.contains('properties-open'))toggleMobileMenu('properties');}
function syncText(){const item=selected.length===1&&selected[0] instanceof paper.PointText?selected[0]:null;$('text-settings').hidden=tool!=='text'&&!item;if(item!==textSelection){textSelection=item;if(item){setTextStyle('bold',item.fontWeight==='bold'||Number(item.fontWeight)>=600);const format=textFormat(item);setTextStyle('italic',format.italic);setTextStyle('underline',format.underline);$('text-letter-spacing').value=Number((format.letterSpacing*72/96).toFixed(3));$('text-line-spacing').value=format.lineSpacing;$('text-content').value=item.data.textLayout?.source??item.content;$('text-size').value=Number((item.fontSize*72/96).toFixed(2));if(![...$('text-font').options].some(option=>option.value===item.fontFamily))$('text-font').add(new Option(item.fontFamily,item.fontFamily));$('text-font').value=item.fontFamily;textAlignment=item.justification;$('text-wrap').checked=!!item.data.textLayout?.width;}}
 fontPicker?.sync();const width=item?.data.textLayout?.width;if(width&&document.activeElement!==$('text-box-width'))$('text-box-width').value=Number((width/units[$('units').value]).toFixed(4));$('text-box-unit').textContent=$('units').value;$('text-box-width-label').hidden=!$('text-wrap').checked;for(const button of document.querySelectorAll('[data-text-align]')){button.setAttribute('aria-pressed',String(button.dataset.textAlign===textAlignment));}}
function textStyle(name){return $('text-'+name).getAttribute('aria-pressed')==='true';}
function setTextStyle(name,active){$('text-'+name).setAttribute('aria-pressed',String(active));}
function textValues(){const size=$('text-size').valueAsNumber;if(!Number.isFinite(size)||size<1||size>750)throw Error('Choose a text size between 1 and 750 pt.');const content=$('text-content').value;if(!content.trim())throw Error('Enter some text first.');return {content,fontSize:size*96/72,fontWeight:textStyle('bold')?'bold':'normal',fontFamily:$('text-font').value,justification:textAlignment};}
function textWidth(){if(!$('text-wrap').checked)return 0;const width=$('text-box-width').valueAsNumber*units[$('units').value];if(!Number.isFinite(width)||width<=0||width>100000)throw Error('Enter a positive box width up to 100,000 pixels.');return width;}
function formattingValues(){const letter=$('text-letter-spacing').valueAsNumber,line=$('text-line-spacing').valueAsNumber;if(!Number.isFinite(letter)||letter< -150||letter>750)throw Error('Choose letter spacing between −150 and 750 pt.');if(!Number.isFinite(line)||line<.5||line>5)throw Error('Choose line spacing between 0.5× and 5×.');return {italic:textStyle('italic'),underline:textStyle('underline'),letterSpacing:letter*96/72,lineSpacing:line};}
function layoutText(item,source,width,format){item.data.textFormat=format;item.leading=item.fontSize*format.lineSpacing;const loaded=fontLibrary.loaded(item.fontFamily,item.fontWeight==='bold',format.italic);item.content=wrapText(source,width,line=>formattedTextWidth(loaded.font,line,item.fontSize,format.letterSpacing));item.data.textLayout={source,width,rendered:item.content,leading:item.leading};}
async function addText(point,boxWidth=null){try{const values=textValues(),format=formattingValues(),width=boxWidth??textWidth();await fontLibrary.ensure(values.fontFamily,values.fontWeight==='bold',format.italic);art.activate();const anchor=point.clone();if(width){anchor.y+=values.fontSize;anchor.x+=values.justification==='center'?width/2:values.justification==='right'?width:0;}const item=new paper.PointText({point:anchor,...values,fillColor:$('no-fill').checked?'#203c43':pickerColor('fill'),strokeColor:null});layoutText(item,values.content,width,format);selected=[item];textSelection=null;revealTextFormatting();commit();$('text-content').focus();$('text-content').select();}catch(error){say(error.message);}}
async function applyText(message='Text updated'){const revision=++textApplyRevision;try{const values=textValues(),format=formattingValues(),width=textWidth(),item=selected.length===1&&selected[0] instanceof paper.PointText?selected[0]:null;if(!item)return say('Click the canvas to place text first.');await fontLibrary.ensure(values.fontFamily,values.fontWeight==='bold',format.italic);if(revision!==textApplyRevision||!item.isInserted()||selected.length!==1||selected[0]!==item)return;const oldWidth=item.data.textLayout?.width||0,fraction=align=>align==='center'?.5:align==='right'?1:0,delta=width*fraction(values.justification)-oldWidth*fraction(item.justification);item.translate(item.localToGlobal(new paper.Point(delta,0)).subtract(item.localToGlobal(new paper.Point(0,0))));Object.assign(item,values);layoutText(item,values.content,width,format);commit();say(typeof message==='string'?message:'Text updated');}catch(error){say(error.message);}}
$('apply-text').onclick=applyText;
$('text-wrap').onchange=()=>{$('text-box-width-label').hidden=!$('text-wrap').checked;};
for(const button of document.querySelectorAll('[data-text-align]'))button.onclick=()=>{textAlignment=button.dataset.textAlign;syncText();if(selected.length===1&&selected[0] instanceof paper.PointText)applyText();};
$('text-font').onchange=()=>{if(selected.length===1&&selected[0] instanceof paper.PointText)applyText();};
fontPicker=installFontPicker({library:fontLibrary,select:$('text-font'),onChange:async()=>{if(selected.length===1&&selected[0] instanceof paper.PointText)await applyText();}});
async function ensureDocumentFonts(){await fontLibrary.ready;const items=art.getItems({class:paper.PointText}).filter(item=>fontLibrary.has(item.fontFamily));const results=await Promise.allSettled(items.map(item=>fontLibrary.ensure(item.fontFamily,item.fontWeight==='bold'||Number(item.fontWeight)>=600,textFormat(item).italic)));items.forEach(item=>item.content=item.content);refresh();const failed=results.find(result=>result.status==='rejected');if(failed)say(failed.reason.message||'A drawing font could not be loaded. Connect to download it, or select another font.');}
async function vectorSVG(items=art,fitSelection=false){const copy=new paper.Group({insert:false});for(const item of Array.isArray(items)?items:items.children)copy.addChild(item.clone({insert:false}));try{for(const item of copy.getItems({class:paper.PointText})){const loaded=await fontLibrary.ensure(item.fontFamily,item.fontWeight==='bold'||Number(item.fontWeight)>=600,textFormat(item).italic),geometry=textGeometry(item,loaded);const group=new paper.Group({insert:false,opacity:item.opacity,visible:item.visible,blendMode:item.blendMode});group.data.objectGroup=true;for(const d of geometry.outlines){const outline=new paper.CompoundPath({pathData:d,insert:false});outline.style=item.style.clone();group.addChild(outline);}for(const line of geometry.underlines){const underline=new paper.Path.Rectangle({rectangle:new paper.Rectangle(line.x,line.y,line.width,line.height),fillColor:item.fillColor||item.strokeColor,strokeColor:null,insert:false});group.addChild(underline);}group.transform(item.matrix);item.replaceWith(group);}return serializeSVG(copy,false,fitSelection);}finally{copy.remove();}}


fontReady.then(()=>ensureDocumentFonts()).catch(()=>say('Text font unavailable. Reload the app to use text.'));

function combineImageShape(operation){
const image=selected.find(imageParts),shape=selected.find(i=>i!==image),parts=imageParts(image);
if(!(shape instanceof paper.PathItem)||!shape.closed)return say(`Select one image and one closed shape to ${operation}.`);
let cutter,result;
try{
cutter=shape.clone({insert:false});cutter.transform(image.globalMatrix.inverted());
result=parts.mask[operation](cutter,{insert:false});
if(result.isEmpty()||Math.abs(result.area)<.000001){result.remove();return say(operation==='intersect'?'The shape does not overlap the visible image. Originals kept.':'The shape would remove the entire image.');}
const normalized=cutter.clone({insert:false});normalized.transform(parts.raster.matrix.inverted());const saved=normalized.exportJSON({asString:true,precision:15});normalized.remove();
result.clipMask=true;parts.mask.replaceWith(result);
const key=operation==='intersect'?'intersections':'cutouts';image.data[key]=[...(image.data[key]||[]),saved];
shape.remove();selected=[image];cropSelection=null;commit();say(operation==='intersect'?'Image clipped to shape. Undo restores both.':'Shape subtracted from image. Undo restores it.');
}catch{result?.remove();say(`Could not ${operation} this shape with the image.`);}finally{cutter?.remove();}
}
const handleSize=document.createElement('form');handleSize.id='handle-size';handleSize.hidden=true;handleSize.innerHTML='<label data-axis="width">W <input id="handle-width" aria-label="Handle width" type="number" min="0.0001" step="any" required><span class="handle-unit"></span></label><label data-axis="height">H <input id="handle-height" aria-label="Handle height" type="number" min="0.0001" step="any" required><span class="handle-unit"></span></label><button type="button" id="close-handle-size" aria-label="Cancel dimension edit" title="Cancel dimension edit">×</button>';$('stage').append(handleSize);
var handleContext;
function hideHandleSize(){document.getElementById('handle-size')?.setAttribute('hidden','');handleContext=null;}
function showHandleSize(context){handleContext={...context,items:[...selected]};const bounds=selectionBounds(),point=resizeHandles(bounds).find(h=>h.name===context.name).point,screen=paper.view.projectToView(point),axis=context.axis||(/[ew]/.test(context.name)?'width':'height');for(const dimension of ['width','height']){handleSize.querySelector(`[data-axis="${dimension}"]`).hidden=dimension!==axis;const field=$(`handle-${dimension}`);field.value=formatLength(bounds[dimension]);field.dataset.actual=field.value;delete field.dataset.pending;field.classList.remove('pending');}handleSize.dataset.axis=axis;handleSize.querySelectorAll('.handle-unit').forEach(el=>el.textContent=$('units').value);handleSize.hidden=false;handleSize.style.left=`${Math.max(4,Math.min(screen.x+12,$('stage').clientWidth-handleSize.offsetWidth-4))}px`;handleSize.style.top=`${Math.max(4,Math.min(screen.y+12,$('stage').clientHeight-handleSize.offsetHeight-4))}px`;const input=$(`handle-${axis}`);input.focus({preventScroll:true});input.select();}
function applyHandleSize(axis){if(!$(`handle-${axis}`).dataset.pending)return hideHandleSize();if(!handleContext||handleContext.items.some(i=>!i.isInserted())||selected.length!==handleContext.items.length||selected.some(i=>!handleContext.items.includes(i)))return hideHandleSize();const bounds=selectionBounds(),factor=units[$('units').value],input=$(`handle-${axis}`),value=input.valueAsNumber*factor;if(!Number.isFinite(value)||value<=0||value>100000||bounds.width<.001||bounds.height<.001)return say('Enter a positive dimension up to 100,000 pixels.');const scale=value/bounds[axis],sx=axis==='width'?scale:1,sy=axis==='height'?scale:1,a=handleContext.anchor,m=new paper.Matrix(sx,0,0,sy,a.x*(1-sx),a.y*(1-sy));selected.forEach(i=>i.transform(m));hideHandleSize();commit();say(`${axis==='width'?'Width':'Height'} applied`);}
for(const axis of ['width','height']){$(`handle-${axis}`).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyHandleSize(axis);}});$(`handle-${axis}`).addEventListener('blur',e=>{if(handleSize.hidden||handleSize.dataset.axis!==axis||e.relatedTarget===$('close-handle-size'))return;applyHandleSize(axis);});}
$('close-handle-size').addEventListener('pointerdown',e=>{e.preventDefault();hideHandleSize();});
$('close-handle-size').onclick=hideHandleSize;
handleSize.addEventListener('submit',e=>e.preventDefault());
handleSize.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();hideHandleSize();canvas.focus({preventScroll:true});}});
document.addEventListener('pointerdown',e=>{if(!handleSize.hidden&&!handleSize.contains(e.target)){applyHandleSize(handleSize.dataset.axis);if(!handleSize.hidden){e.preventDefault();e.stopImmediatePropagation();}}},true);
$('units').addEventListener('change',hideHandleSize);

// Measure detached copies so hidden descendants do not enlarge the page.
function visibleContentBounds(){
 let bounds=null;
 for(const item of art.children){
  const copy=item.clone({insert:false});
  try{
   function prune(node){if(!node.visible||node.opacity===0)return false;if(node.children){for(const child of [...node.children])if(!prune(child))child.remove();return node.children.length>0;}return node.clipMask||node instanceof paper.Raster||!!node.fillColor||!!node.strokeColor;}
   if(prune(copy)){const box=copy.strokeBounds;if(box.width||box.height)bounds=bounds?bounds.unite(box):box.clone();}
  }finally{copy.remove();}
 }
 return bounds;
}
$('fit-canvas-content').onclick=()=>{
 finish();const bounds=visibleContentBounds();
 if(!bounds)return say('Add visible artwork before fitting the canvas.');
 if(bounds.width>100000||bounds.height>100000)return say('Content is too large to fit the canvas.');
 art.children.forEach(item=>item.translate(bounds.topLeft.negate()));
 pageSize={width:Math.max(.01,bounds.width),height:Math.max(.01,bounds.height)};
 guides=[];hideHandleSize();commit();fit();say('Canvas fitted to visible content.');
};
function applyPageDimension(axis){const field=$(`page-${axis}`),value=field.valueAsNumber*units[$('units').value];if(!Number.isFinite(value)||value<=0||value>100000)return say('Enter a positive artboard dimension up to 100,000 pixels.');finish();pageSize={...pageSize,[axis]:value};delete field.dataset.pending;commit();say('Artboard dimension applied');}
for(const axis of ['width','height']){const field=$(`page-${axis}`);field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(field.dataset.pending)applyPageDimension(axis);}});field.addEventListener('blur',()=>{if(field.dataset.pending)applyPageDimension(axis);});}
for(const id of ['position-x','position-y'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('apply-position').click();}});

var dimensionLabels=document.createElement('div');dimensionLabels.id='dimension-labels';
dimensionLabels.innerHTML=['width','height'].map(axis=>`<label class="dimension-label" data-axis="${axis}"><input id="selection-${axis}-label" aria-label="Edit selection ${axis}" type="number" step="any"><button type="button" class="cancel-dimension" aria-label="Cancel ${axis} edit">×</button></label>`).join('');$('stage').append(dimensionLabels);
var inlineDimensionContext;
function syncDimensionLabels(){if(!dimensionLabels)return;if(!dimensionsEnabled||tool!=='select'||drag){dimensionLabels.hidden=true;return;}const bounds=selectionBounds();dimensionLabels.hidden=!dimensionsEnabled||!bounds||tool!=='select'||!!drag;if(dimensionLabels.hidden)return;const stage=$('stage'),clamp=(v,max)=>Math.max(4,Math.min(v,max));for(const axis of ['width','height']){const input=$(`selection-${axis}-label`),box=input.parentElement,p=paper.view.projectToView(axis==='width'?bounds.bottomCenter:bounds.rightCenter);if(document.activeElement!==input){input.value=formatLength(bounds[axis]);input.dataset.actual=input.value;delete input.dataset.pending;input.classList.remove('pending');}box.style.left=`${clamp(p.x+(axis==='width'?-box.offsetWidth/2:12),stage.clientWidth-box.offsetWidth-4)}px`;box.style.top=`${clamp(p.y+(axis==='width'?12:-box.offsetHeight/2),stage.clientHeight-box.offsetHeight-4)}px`;}}
function endInlineDimension(cancel=false){const context=inlineDimensionContext;if(!context)return true;const {axis,input,items}=context,bounds=selectionBounds();if(!cancel&&input.dataset.pending&&bounds&&items.length===selected.length&&items.every(item=>item.isInserted()&&selected.includes(item))){const value=input.valueAsNumber*units[$('units').value];if(!Number.isFinite(value)||value<=0||value>100000||bounds.width<.001||bounds.height<.001){say('Enter a positive dimension up to 100,000 pixels.');return false;}const scale=value/bounds[axis],sx=axis==='width'?scale:1,sy=axis==='height'?scale:1;selected.forEach(item=>item.transform(new paper.Matrix(sx,0,0,sy,bounds.left*(1-sx),bounds.top*(1-sy))));inlineDimensionContext=null;delete input.dataset.pending;commit();say(`${axis==='width'?'Width':'Height'} applied`);}inlineDimensionContext=null;input.blur();syncDimensionLabels();return true;}
for(const axis of ['width','height']){const input=$(`selection-${axis}-label`);input.addEventListener('focus',()=>{hideHandleSize();inlineDimensionContext={axis,input,items:[...selected]};input.dataset.actual=input.value;});input.addEventListener('blur',()=>{if(!endInlineDimension())endInlineDimension(true);});input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopPropagation();endInlineDimension(e.key==='Escape');}});const cancel=input.parentElement.querySelector('.cancel-dimension');cancel.addEventListener('pointerdown',e=>{e.preventDefault();endInlineDimension(true);});cancel.onclick=()=>endInlineDimension(true);}
document.addEventListener('pointerdown',e=>{if(inlineDimensionContext&&!inlineDimensionContext.input.parentElement.contains(e.target)&&!endInlineDimension()){e.preventDefault();e.stopImmediatePropagation();}},true);
const dimensionFields=['position-x','position-y','dimension-width','dimension-height','page-width','page-height','handle-width','handle-height','selection-width-label','selection-height-label'];
const expressionLabels={'position-x':'x','position-y':'y','dimension-width':'w','dimension-height':'h','page-width':'w','page-height':'h','handle-width':'w','handle-height':'h','selection-width-label':'w','selection-height-label':'h'};
for(const input of new Set([...dimensionFields.map($),...document.querySelectorAll('input[type=number]')])){const id=input.id;input.type='text';input.inputMode=expressionLabels[id]?'text':'decimal';if(expressionLabels[id]){input.title='Enter a number or use +, −, ×, ÷ and parentheses.';input.setAttribute('autocapitalize','off');input.setAttribute('autocorrect','off');input.spellcheck=false;}Object.defineProperty(input,'valueAsNumber',{get(){return expressionLabels[id]?dimensionExpression(this.value,expressionLabels[id]):this.value.trim()?Number(this.value):NaN;}});input.addEventListener('input',()=>{if(!dimensionFields.includes(id))return;const pending=input.value!==input.dataset.actual;if(pending)input.dataset.pending='true';else delete input.dataset.pending;input.classList.toggle('pending',pending);});input.enterKeyHint='done';input.addEventListener('blur',()=>{preserveDimensionViewUntil=Date.now()+800;});input.addEventListener('focus',()=>{preserveDimensionViewUntil=Date.now()+800;setTimeout(()=>{if(document.activeElement===input)input.select();},0);});input.addEventListener('pointerup',e=>{if(e.pointerType==='touch'||e.detail>1)setTimeout(()=>input.select(),0);});input.addEventListener('dblclick',()=>input.select());}
const applyPosition=$('apply-position').onclick;$('apply-position').onclick=()=>{applyPosition();updateDimensions();};
$('dimensions-toggle').onclick=()=>{dimensionsEnabled=!dimensionsEnabled;if(!dimensionsEnabled){endInlineDimension(true);hideHandleSize();}try{localStorage.setItem('vector-lab-dimensions',String(dimensionsEnabled));}catch{}refresh();};
syncDimensionLabels();

for(const style of ['bold','italic','underline'])$('text-'+style).onclick=()=>{setTextStyle(style,!textStyle(style));if(selected.length===1&&selected[0] instanceof paper.PointText)applyText(style==='bold'?'Text weight updated':'Text style updated');};

$('return-to-page').onclick=()=>{fit();canvas.focus({preventScroll:true});say('Page centered');};
document.addEventListener('pointerdown',e=>{for(const menu of [$('image-crop').querySelector('details')])if(menu.open&&!menu.contains(e.target))menu.open=false;});

const toolShortcuts={s:'select',n:'nodes',t:'text',p:'pen',r:'rectangle',e:'ellipse',d:'dropper',b:'bucket',l:'blob',c:'crop',h:'pan'};
const shortcutHint=document.createElement('div');shortcutHint.id='shortcut-hint';shortcutHint.setAttribute('role','tooltip');shortcutHint.hidden=true;document.body.append(shortcutHint);
let shortcutHold,shortcutDismiss,shortcutStart,shortcutShown=false,shortcutButton=null;
function hideShortcutHint(){clearTimeout(shortcutHold);clearTimeout(shortcutDismiss);shortcutHint.hidden=true;shortcutButton?.removeAttribute('aria-describedby');}
const actionShortcuts={raise:[['Mod',']']],lower:[['Mod','[']],front:[['Mod','Shift',']']],back:[['Mod','Shift','[']],duplicate:[['Mod','D']],'group-objects':[['Mod','G']],'ungroup-objects':[['Mod','Shift','G']],save:[['Mod','S']],undo:[['Mod','Z']],'canvas-undo':[['Mod','Z']],redo:applePlatform?[['Mod','Shift','Z']]:[['Mod','Shift','Z'],['Mod','Y']],'canvas-redo':applePlatform?[['Mod','Shift','Z']]:[['Mod','Shift','Z'],['Mod','Y']],delete:[['Delete'],['Backspace']],'zoom-in':[['='],['+']],'zoom-out':[['-']],finish:[['Enter']]};
for(const button of document.querySelectorAll('button')){const toolKey=button.dataset.tool?Object.keys(toolShortcuts).find(key=>toolShortcuts[key]===button.dataset.tool):null,shortcuts=toolKey?[[toolKey.toUpperCase()]]:actionShortcuts[button.id];if(!shortcuts)continue;const label=(button.title||button.getAttribute('aria-label')||button.querySelector('span')?.textContent||button.textContent.trim()).replace(/\s*\([^)]*\)\s*$/,'');button.title=`${label} (${shortcuts.map(shortcutLabel).join(' / ')})`;if(toolKey)button.setAttribute('aria-label',button.title);button.setAttribute('aria-keyshortcuts',shortcuts.map(shortcutARIA).join(' '));}
// All titled controls support touch help, including icons without shortcuts.
document.addEventListener('pointerdown',e=>{hideShortcutHint();shortcutShown=false;shortcutButton=e.target.closest('button[title],summary[title],label[title]');if(!shortcutButton||shortcutButton.disabled||!['touch','pen'].includes(e.pointerType))return;shortcutStart={x:e.clientX,y:e.clientY};shortcutHold=setTimeout(()=>{shortcutShown=true;shortcutHint.textContent=shortcutButton.title;shortcutHint.hidden=false;const r=shortcutButton.getBoundingClientRect();shortcutHint.style.left=`${Math.max(8,Math.min(r.left,innerWidth-shortcutHint.offsetWidth-8))}px`;shortcutHint.style.top=`${Math.max(8,Math.min(r.bottom+8,innerHeight-shortcutHint.offsetHeight-8))}px`;shortcutButton.setAttribute('aria-describedby','shortcut-hint');},500);});
document.addEventListener('pointermove',e=>{if(shortcutStart&&Math.hypot(e.clientX-shortcutStart.x,e.clientY-shortcutStart.y)>10)hideShortcutHint();});
document.addEventListener('pointerup',()=>{clearTimeout(shortcutHold);shortcutStart=null;shortcutDismiss=setTimeout(hideShortcutHint,2500);});
document.addEventListener('pointercancel',hideShortcutHint);
document.addEventListener('contextmenu',e=>{if(e.target.closest('button[title],summary[title],label[title]'))e.preventDefault();});
document.addEventListener('click',e=>{if(shortcutShown&&shortcutButton?.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();shortcutShown=false;}},true);
for(const [label,ids] of [['Object actions',['duplicate','delete']],['Transform',['shrink','grow','rotate','flip-horizontal','flip-vertical']],['Grouping',['group-objects','ungroup-objects','break-apart']],['Combine shapes',[]]]){const group=document.createElement('div');group.className='toolbar-icon-group';group.setAttribute('role','group');group.setAttribute('aria-label',label);document.querySelector('.object-actions').append(group);for(const button of ids.length?ids.map($):document.querySelectorAll('[data-boolean]'))group.append(button);}
const mobileTools=document.createElement('button');mobileTools.id='mobile-tools';mobileTools.className='mobile-menu-button';mobileTools.textContent='Tools';mobileTools.setAttribute('aria-expanded','false');mobileTools.setAttribute('aria-controls','drawing-tools');
const mobileProperties=document.createElement('button');mobileProperties.id='mobile-properties';mobileProperties.className='mobile-menu-button';mobileProperties.textContent='Properties';mobileProperties.setAttribute('aria-expanded','false');mobileProperties.setAttribute('aria-controls','object-properties');document.querySelector('.top-controls').prepend(mobileTools,mobileProperties);
const toolsDrawer=document.querySelector('main>aside:first-child'),propertiesDrawer=document.querySelector('.properties');toolsDrawer.id='drawing-tools';propertiesDrawer.id='object-properties';
const drawerShade=document.createElement('button');drawerShade.id='drawer-shade';drawerShade.hidden=true;drawerShade.setAttribute('aria-label','Close tool menu');document.body.append(drawerShade);
function closeMobileMenus(){document.body.classList.remove('tools-open','properties-open');drawerShade.hidden=true;mobileTools.setAttribute('aria-expanded','false');mobileProperties.setAttribute('aria-expanded','false');}
function toggleMobileMenu(name){const wasOpen=document.body.classList.contains(`${name}-open`);closeMobileMenus();if(!wasOpen){document.body.classList.add(`${name}-open`);drawerShade.hidden=false;(name==='tools'?mobileTools:mobileProperties).setAttribute('aria-expanded','true');}}
mobileTools.onclick=()=>toggleMobileMenu('tools');mobileProperties.onclick=()=>toggleMobileMenu('properties');drawerShade.onclick=closeMobileMenus;
for(const drawer of [toolsDrawer,propertiesDrawer]){const close=document.createElement('button');close.className='mobile-menu-close';close.textContent='Close ×';close.onclick=closeMobileMenus;drawer.prepend(close);}
toolsDrawer.addEventListener('click',e=>{if(e.target.closest('[data-tool],#undo,#redo')&&matchMedia('(max-width:700px), (max-height:500px) and (orientation:landscape)').matches)closeMobileMenus();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileMenus();});matchMedia('(max-width:700px), (max-height:500px) and (orientation:landscape)').addEventListener('change',closeMobileMenus);
const mobileToolbarShell=document.createElement('div');mobileToolbarShell.className='mobile-toolbar-shell';const toolbarContext=document.querySelector('.context');toolbarContext.before(mobileToolbarShell);const toolbarFrame=document.createElement('div');toolbarFrame.className='toolbar-scroll-frame';toolbarFrame.append(toolbarContext);mobileToolbarShell.append(mobileTools,mobileProperties,toolbarFrame);

const portraitProperties=matchMedia('(min-width:701px) and (max-width:1100px) and (orientation:portrait)');portraitProperties.addEventListener('change',closeMobileMenus);
let scrollCueFrame;
function updateScrollCues(){cancelAnimationFrame(scrollCueFrame);scrollCueFrame=requestAnimationFrame(()=>{const left=toolbarContext.scrollLeft>2,right=toolbarContext.scrollWidth-toolbarContext.clientWidth-toolbarContext.scrollLeft>2;toolbarFrame.classList.toggle('can-scroll-left',left);toolbarFrame.classList.toggle('can-scroll-right',right);$('toolbar-scroll-left').hidden=!left;$('toolbar-scroll-right').hidden=!right;});}
for(const direction of ['left','right']){const button=document.createElement('button');button.id=`toolbar-scroll-${direction}`;button.className=`toolbar-scroll-cue ${direction}`;button.type='button';button.hidden=true;button.title=`Scroll toolbar ${direction}`;button.setAttribute('aria-label',button.title);button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction==='left'?'M15 5l-7 7 7 7':'M9 5l7 7-7 7'}"/></svg>`;button.onclick=()=>toolbarContext.scrollBy({left:(direction==='left'?-1:1)*toolbarContext.clientWidth*.65,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});toolbarFrame.append(button);}
toolbarContext.addEventListener('scroll',updateScrollCues,{passive:true});new ResizeObserver(updateScrollCues).observe(toolbarContext);new MutationObserver(updateScrollCues).observe(toolbarContext,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});updateScrollCues();refresh();
const fileMenu=$('file-menu'),fileMenuButton=$('file-menu-button'),settingsDialog=$('settings-dialog');
function closeFileMenu(){fileMenu.hidden=true;fileMenuButton.setAttribute('aria-expanded','false');}
fileMenuButton.onclick=()=>{const open=fileMenu.hidden;fileMenu.hidden=!open;fileMenuButton.setAttribute('aria-expanded',String(open));};
fileMenu.addEventListener('click',e=>{if(e.target.closest('button'))closeFileMenu();});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.file-dropdown'))closeFileMenu();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!fileMenu.hidden){closeFileMenu();fileMenuButton.focus();}});
$('settings').onclick=()=>{closeFileMenu();closeMobileMenus();settingsDialog.showModal();updateDimensions();};
for(const id of ['close-settings','settings-done'])$(id).onclick=()=>settingsDialog.close();
settingsDialog.addEventListener('close',()=>fileMenuButton.focus());

// Fixed popovers escape the scrolling toolbar without clipping or changing its
// size. Re-anchor them as controls scroll, resize, or open a native details menu.
function positionToolbarMenus(){
  const crop=document.querySelector('#image-crop details');
  for(const [menu,anchor,open] of [[document.querySelector('.crop-popover'),crop.querySelector('summary'),crop.open]]){
    if(!open)continue;
    const r=anchor.getBoundingClientRect();menu.style.setProperty('--menu-left',Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))+'px');menu.style.setProperty('--menu-top',Math.max(4,Math.min(r.bottom+6,innerHeight-menu.offsetHeight-8))+'px');
  }
}
document.addEventListener('click',positionToolbarMenus);window.addEventListener('resize',positionToolbarMenus);
document.querySelector('.context').addEventListener('scroll',positionToolbarMenus);
for(const menu of [document.querySelector('#image-crop details')])menu.addEventListener('toggle',positionToolbarMenus);

// Load the canvas synchronously, then check again when ownership is granted.
// This preserves immediate keyboard interaction after reloading the page.
if(!window.handoutVectorLab) void browserRecovery.start(initialRecoveryState.snapshot,initialRecoveryState.name,()=>{
  if(localStorage.getItem('vector-lab')!==recoveredBrowserData||localStorage.getItem('vector-lab-name')!==recoveredBrowserName)return recoverBrowserDrawing();
  return {snapshot:snapshot(),name:drawingName};
});

// Handout Maker supplies only the selected image, never filesystem access.
if (window.handoutVectorLab?.version === 1) {
  window.handoutVectorLabConnected = true;
  const bridge = window.handoutVectorLab;
  const toolbar = document.createElement('div');
  toolbar.style.cssText='position:fixed;bottom:12px;right:16px;z-index:10000;background:#fff;padding:10px;border:1px solid #aaa;border-radius:8px;display:flex;gap:12px;align-items:center;color:#172c3b';
  const status=document.createElement('span');status.textContent='Opening image from Handout Maker…';
  const save=document.createElement('button');save.textContent='Save back to slideshow';save.disabled=true;
  const format=document.createElement('select');format.setAttribute('aria-label','Save image format');
  toolbar.append(status,format,save);document.body.append(toolbar);
  let session;
  const base64 = async blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Could not encode image.'));reader.readAsDataURL(blob);});
  void (async()=>{
    try {
      session=await bridge.open();
      if(session.version!==1)throw Error('This Handout Maker connection needs an update.');
      format.replaceChildren();
      for(const [value,label] of session.mime==='image/jpeg'?[['image/jpeg','Keep JPG'],['image/png','Replace with editable PNG']]:[[session.mime,session.mime==='image/png'?'Editable PNG':'Editable SVG']]){const option=document.createElement('option');option.value=value;option.textContent=label;format.append(option);}
      if(session.creating)save.textContent='Insert into document';
      const bytes=Uint8Array.from(atob(session.base64),character=>character.charCodeAt(0));
      const file=new File([bytes],session.name,{type:session.mime});
      let imported, rasterFallback = false;
      if(session.mime==='image/svg+xml') {
        try { const text=await file.text(); imported=parseSVG(/<style[\s>]/i.test(text)?inlineSVGStyles(text):text); } catch { rasterFallback=true; }
      } else {const svg=await readEditableSVG(file);if(svg){try{imported=parseSVG(svg);}catch{rasterFallback=true;}}}
      selected=[];selectedNodes=[];art.removeChildren();
      if(imported){pageSize={...imported.page};imported.items.forEach(item=>art.addChild(item));}
      else {
        const image=new Image();image.src='data:'+session.mime+';base64,'+session.base64;await image.decode();
        pageSize={width:image.naturalWidth,height:image.naturalHeight};
        const raster=new paper.Raster({image,insert:false});raster.position=new paper.Point(pageSize.width/2,pageSize.height/2);
        const mask=new paper.Path.Rectangle({rectangle:raster.bounds,insert:false});mask.clipMask=true;
        const group=new paper.Group({children:[mask,raster],insert:false});group.data.image=true;group.applyMatrix=false;art.addChild(group);
      }
      drawingName=session.name.replace(/\.(png|svg)$/i,'');history=[snapshot()];future=[];ensureDocumentFonts();fit();refresh();
      selected=[...art.children];setTool('select');refresh();
      status.textContent=session.name+(session.mime==='image/jpeg'?' — JPG saves flatten artwork; use Save SVG to keep editable objects.':'')+(rasterFallback?' — Opened as an image; original SVG objects could not be imported.':'');save.disabled=false;handoutSessionLoading=false;bridge.dirty(false);
    }catch(error){status.textContent='Could not open image: '+error.message;toolbar.setAttribute('role','alert');toolbar.style.borderColor='#b42318';toolbar.style.maxWidth='90vw';status.style.whiteSpace='normal';say(status.textContent);}
  })();
  save.onclick=async()=>{
    save.disabled=true;
    try {
      finish(); const revision=snapshot(); let blob;
      if(session.mime==='image/svg+xml')blob=new Blob([serializeSVG(art,true)],{type:session.mime});
      else {
        await fontLibrary.ready;
        const rendered=await vectorSVG(art,false);
        blob=await createPNG(rendered,pageSize.width,pageSize.height);
        if(format.value==='image/png')blob=await embedEditableSVG(blob,serializeSVG(art,true));
      }
      const result=await bridge.save({version:1,mime:format.value,base64:await base64(blob)});
      if(result.saved){if(result.mime)session.mime=result.mime;if(result.name)session.name=result.name;save.textContent='Save back to slideshow';if(session.mime==='image/png'){format.replaceChildren(new Option('Editable PNG','image/png'));}}
      const dirty=!result.saved || snapshot()!==revision;bridge.dirty(dirty);
      status.textContent=result.saved?(dirty?'Saved; newer changes still need saving.':'Saved to slideshow.'):'Save cancelled.';
    }catch(error){status.textContent=error.message;bridge.dirty(true);}finally{save.disabled=false;}
  };
}
