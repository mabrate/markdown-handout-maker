import paper from 'paper';

function capsule(a,b,radius){
  const delta=b.subtract(a);if(delta.length<.001)return new paper.Path.Circle({center:a,radius,insert:false});
  const along=delta.normalize(radius),normal=new paper.Point(-along.y,along.x),path=new paper.Path({insert:false});
  path.add(a.add(normal));path.lineTo(b.add(normal));path.arcTo(b.add(along),b.subtract(normal));path.lineTo(a.subtract(normal));path.arcTo(a.subtract(along),a.add(normal));path.closed=true;return path;
}
// Resample by distance before filtering, so fast and slow pointer events get
// the same smoothing. Keep the stroke endpoints at the user's actual positions.
export function smoothBlobPoints(points,diameter,smoothing=100){
  const strength=Math.max(0,Math.min(200,smoothing))/100;
  if(points.length<3||!strength)return points;
  const spacing=Math.max(.75,Math.min(4,diameter/8)),samples=[points[0]];let remaining=spacing;
  for(let i=1;i<points.length;i++){
    let a=points[i-1],length=a.getDistance(points[i]);
    while(length>=remaining){a=a.add(points[i].subtract(a).multiply(remaining/length));samples.push(a);length=a.getDistance(points[i]);remaining=spacing;}
    remaining-=length;
  }
  if(samples.at(-1).getDistance(points.at(-1))>.001)samples.push(points.at(-1));
  const radius=Math.max(1,Math.ceil(diameter*.65*strength/spacing));
  return samples.map((p,i)=>{
    if(i===0||i===samples.length-1)return p;
    let sum=new paper.Point(),weight=0;
    for(let j=i-radius;j<=i+radius;j++){
      const q=j<0?samples[0].multiply(2).subtract(samples[Math.min(-j,samples.length-1)]):j>=samples.length?samples.at(-1).multiply(2).subtract(samples[Math.max(0,2*(samples.length-1)-j)]):samples[j];
      const w=radius+1-Math.abs(j-i);sum=sum.add(q.multiply(w));weight+=w;
    }
    return sum.divide(weight);
  });
}
function smoothCenterline(points,diameter,smoothing){
  const strength=Math.max(0,Math.min(200,smoothing))/100;
  const line=new paper.Path({segments:smoothBlobPoints(points,diameter,smoothing),insert:false});
  if(points.length>2)line.simplify(.1+diameter*.06*Math.min(1,strength));
  return line;
}
function offsetOutline(line,radius){
  const count=Math.max(2,Math.ceil(line.length/Math.max(.5,Math.min(3,radius/4)))),left=[],right=[];
  for(let i=0;i<=count;i++){const distance=line.length*i/count,p=line.getPointAt(distance),normal=line.getNormalAt(distance);if(!p||!normal)return null;left.push(p.add(normal.multiply(radius)));right.push(p.subtract(normal.multiply(radius)));}
  const sides=[left,right].map(points=>new paper.Path({segments:points,insert:false}));
  try{
    for(const side of sides){side.simplify(.12);for(const [segment,distance] of [[side.firstSegment,0],[side.lastSegment,line.length]]){const tangent=line.getTangentAt(distance);segment.handleIn=tangent.multiply(-segment.handleIn.length);segment.handleOut=tangent.multiply(segment.handleOut.length);}}
    // Tight bends and crossings need a union of the swept disks instead of a
    // single offset strip. Never simplify their caps together with their sides.
    if(line.getIntersections().length||sides.some(side=>side.getIntersections().length)||sides[0].getIntersections(sides[1]).length)return null;
    const outline=new paper.Path({segments:sides[0].segments.map(s=>s.clone()),insert:false}),back=sides[1].clone({insert:false});back.reverse();
    try{
      outline.arcTo(line.lastSegment.point.add(line.getTangentAt(line.length).multiply(radius)),back.firstSegment.point);
      outline.lastSegment.handleOut=back.firstSegment.handleOut.clone();
      for(const segment of back.segments.slice(1))outline.add(segment.clone());
      outline.arcTo(line.firstSegment.point.subtract(line.getTangentAt(0).multiply(radius)),outline.firstSegment.point);outline.closePath();
      if(outline.getIntersections().length){outline.remove();return null;}
      return outline;
    }catch(error){outline.remove();throw error;}finally{back.remove();}
  }finally{sides.forEach(side=>side.remove());}
}
export function blobOutline(points,diameter,smoothing=100){
  const radius=diameter/2;
  if(points.length===1||points.every(p=>p.getDistance(points[0])<.001))return new paper.Path.Circle({center:points[0],radius,insert:false});
  const line=smoothCenterline(points,diameter,smoothing);
  try{
    const outline=offsetOutline(line,radius);if(outline)return outline;
    // Flatten the fitted centerline accurately before sweeping it. Simplifying
    // the final closed perimeter mixed straight sides and caps into wavy curves.
    line.flatten(.12);points=line.segments.map(s=>s.point);let result=new paper.Path.Circle({center:points[0],radius,insert:false});
    try{for(let i=1;i<points.length;i++){const part=capsule(points[i-1],points[i],radius);try{const next=result.unite(part,{insert:false});result.remove();result=next;}finally{part.remove();}}return result;}catch(error){result.remove();throw error;}
  }finally{line.remove();}
}
function candidates(parent){
  const result=[];
  function visit(item){
    if(!item.visible||item.opacity===0)return;
    if(item instanceof paper.Path||item instanceof paper.CompoundPath){
      const paths=item instanceof paper.Path?[item]:item.children;
      if(paths.length&&paths.every(p=>p.closed&&p.segments.length>=3))result.push(item);
    }else if(item instanceof paper.Group&&!item.clipped)item.children.forEach(visit);
  }
  parent.children.forEach(visit);return result;
}
function worldCopy(item){const copy=item.clone({insert:false});copy.applyMatrix=true;copy.transform(item.parent.globalMatrix);copy.data={};return copy;}
function connects(a,b){
  if(!a.bounds.expand(1e-6).intersects(b.bounds))return false;
  if(a.getIntersections(b).length)return true;
  const first=item=>item instanceof paper.CompoundPath?item.children:item?[item]:[];
  return first(a).some(p=>b.contains(p.firstSegment.point))||first(b).some(p=>a.contains(p.firstSegment.point));
}
export function applyBlob(parent,points,diameter,color,smoothing=100){
  let result=blobOutline(points,diameter,smoothing);const originals=candidates(parent),copies=originals.map(worldCopy),merged=new Set();
  try{
    // Test against the brush itself, so touching a shape does not recolor
    // other artwork further away just because it shares an edge with it.
    for(let i=0;i<copies.length;i++)if(connects(result,copies[i]))merged.add(i);
    for(const i of merged){const next=result.unite(copies[i],{insert:false});result.remove();result=next;}
    result.data={};result.fillColor=color;result.strokeColor=null;result.strokeWidth=0;
    parent.addChild(result);
    for(const i of merged){let container=originals[i].parent;originals[i].remove();while(container!==parent&&container instanceof paper.Group&&!container.children.length){const next=container.parent;container.remove();container=next;}}
    return {path:result,merged:merged.size};
  }catch(error){result.remove();throw error;}finally{copies.forEach(copy=>copy.remove());}
}
