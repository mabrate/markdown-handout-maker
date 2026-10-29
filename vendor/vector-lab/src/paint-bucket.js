import paper from 'paper';
import {traceBinaryRegion} from './image-tracing.js';

// Work on detached, world-coordinate copies. Neither filling nor boolean
// partitioning changes the source paths or their group transforms.
function boundaries(parent){
  const paths=[];
  function visit(item,inheritedStyle=null){
    if(!item.visible||item.opacity===0)return;
    if(item instanceof paper.Path){
      const style=inheritedStyle||item;
      if(item.segments.length<2||!style.fillColor&&!style.strokeColor)return;
      const copy=item.clone({insert:false});copy.applyMatrix=true;
      copy.transform(item.parent.globalMatrix);copy.data={};paths.push(copy);
    }else if(item instanceof paper.Group&&item.clipped)return;
    else if(item.children) item.children.forEach(child=>visit(child,item instanceof paper.CompoundPath?item:inheritedStyle));
  }
  parent.children.forEach(item=>visit(item));return paths;
}
function exactRegion(paths,point,page){
  if(!paths.some(p=>p.closed&&p.contains(point)))return null;
  let region=new paper.Path.Rectangle({rectangle:page,insert:false});
  for(const boundary of paths){
    if(!boundary.closed)continue;
    const next=boundary.contains(point)?region.intersect(boundary,{insert:false}):region.subtract(boundary,{insert:false});
    region.remove();region=next;
  }
  if(!region.contains(point)){region.remove();return null;}
  // Booleans may leave other disconnected islands. Keep only the clicked
  // outer loop and its holes, using containment rather than winding direction.
  const loops=region instanceof paper.CompoundPath?region.children:[region];
  const containing=loops.filter(p=>p.contains(point)).sort((a,b)=>Math.abs(a.area)-Math.abs(b.area));
  const outer=containing[0];if(!outer){region.remove();return null;}
  const keep=[outer,...loops.filter(p=>p!==outer&&!p.contains(point)&&outer.contains(p.getPointAt(p.length*.37)))];
  const result=new paper.CompoundPath({children:keep.map(p=>p.clone({insert:false})),insert:false});
  result.fillRule='evenodd';region.remove();
  if(result.children.length===1){const single=result.firstChild;single.remove();result.remove();return single;}
  return result;
}
function sampledRegion(paths,point,page){
  // Open paths can jointly form an enclosure. Flood only vector centerlines,
  // on a document-sized grid independent of screen zoom or device pixel ratio.
  const scale=Math.min(2,2044/Math.max(page.width,page.height)),width=Math.ceil(page.width*scale)+4,height=Math.ceil(page.height*scale)+4;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.translate(2,2);ctx.scale(scale,scale);ctx.lineWidth=1.2/scale;ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='black';
  for(const path of paths)ctx.stroke(new Path2D(path.pathData));
  const pixels=ctx.getImageData(0,0,width,height).data,seedX=Math.floor(point.x*scale)+2,seedY=Math.floor(point.y*scale)+2,seed=seedY*width+seedX;
  if(pixels[seed*4+3]>96)throw Error('Click inside the area, away from its boundary.');
  const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=1;queue[0]=seed;seen[seed]=1;
  while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);
    if(x===0||y===0||x===width-1||y===height-1)return null;
    for(const n of [i-1,i+1,i-width,i+width])if(!seen[n]&&pixels[n*4+3]<=96){seen[n]=1;queue[tail++]=n;}
  }
  const trace=traceBinaryRegion(seen,width,height);
  if(trace.tooComplex)throw Error('This area is too complex to fill. Simplify its boundaries first.');
  const children=trace.segments.map(loop=>new paper.Path({insert:false,closed:true,segments:loop.map(([p,a,b])=>new paper.Segment([(p[0]-2)/scale,(p[1]-2)/scale],a.map(v=>v/scale),b.map(v=>v/scale)))}));
  if(!children.length)return null;
  if(children.length===1)return children[0];
  return new paper.CompoundPath({children,insert:false,fillRule:'evenodd'});
}
export function createBucketFill(parent,point,pageSize,color){
  const page=new paper.Rectangle(0,0,pageSize.width,pageSize.height);if(!page.contains(point))throw Error('Click an enclosed area on the page.');
  const paths=boundaries(parent);
  try{
    let region=exactRegion(paths,point,page);
    if(paths.some(p=>!p.closed&&(!region||p.bounds.intersects(region.bounds)))){region?.remove();region=sampledRegion(paths,point,page);}
    if(!region)throw Error('No enclosed vector area here. Close any gaps in the paths first.');
    region.data={};region.fillColor=color;region.strokeColor=null;region.strokeWidth=0;
    return region;
  }finally{paths.forEach(p=>p.remove());}
}
