// Keep editor handles alive between frames; none of these items belong to artwork.
export function createInteractionOverlay(paper,layer){
 const slots=[],styles=new WeakMap();let cursor=0;
 function acquire(kind,create){
  const index=cursor++;let slot=slots[index];
  if(slot?.kind!==kind){slot?.item.remove();slot={kind,item:create()};slots[index]=slot;layer.insertChild(index,slot.item);}
  slot.item.visible=true;slot.item.data={};return slot.item;
 }
 function style(item,options){
  const next={fillColor:null,strokeColor:null,strokeWidth:1,dashArray:[],strokeCap:'butt',strokeJoin:'miter',...options},previous=styles.get(item);
  const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>v===b[i]):a?.equals?a.equals(b):a===b;
  if(!previous||Object.keys(next).some(key=>!equal(next[key],previous[key]))){item.style=next;styles.set(item,next);}
  return item;
 }
 return {
  begin(){cursor=0;},
  end(){for(let i=cursor;i<slots.length;i++)slots[i].item.remove();slots.length=cursor;},
  rectangle({rectangle,point,size,...options}){
   const box=rectangle?new paper.Rectangle(rectangle):new paper.Rectangle(point,size);
   const item=acquire('rectangle',()=>new paper.Path({segments:[[0,0],[0,0],[0,0],[0,0]],closed:true,insert:false}));
   [box.topLeft,box.topRight,box.bottomRight,box.bottomLeft].forEach((p,i)=>{if(!item.segments[i].point.equals(p))item.segments[i].point=p;});return style(item,options);
  },
  circle({center,radius,...options}){
   const item=acquire('circle',()=>new paper.Path.Circle({center:[0,0],radius:1,insert:false}));
   const bounds=new paper.Rectangle(new paper.Point(center).subtract([radius,radius]),new paper.Size(radius*2,radius*2));if(!item.bounds.equals(bounds))item.bounds=bounds;return style(item,options);
  },
  line({from,to,...options}){
   const item=acquire('line',()=>new paper.Path({segments:[[0,0],[0,0]],insert:false}));
   if(!item.firstSegment.point.equals(from))item.firstSegment.point=from;if(!item.lastSegment.point.equals(to))item.lastSegment.point=to;return style(item,options);
  },
  path({segments,closed=false,...options}){
   const item=acquire('path',()=>new paper.Path({insert:false}));item.segments=segments;item.closed=closed;return style(item,options);
  },
  text(options){const item=acquire('text',()=>new paper.PointText({insert:false}));Object.assign(item,options);return item;}
 };
}
