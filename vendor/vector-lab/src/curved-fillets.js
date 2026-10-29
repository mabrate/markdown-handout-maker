// A fillet centre is an intersection of the two radius-offset curves.
// Search only the half of each segment nearest the selected corner.
export function solveCurvedFillet(paper,incoming,outgoing,radius){
 const turn=incoming.getTangentAtTime(1).cross(outgoing.getTangentAtTime(0)),side=Math.sign(turn);
 if(!side||radius<=0)return null;
 const before=incoming.length/2*(1-1e-5),after=outgoing.length/2*(1-1e-5);
 if(Math.min(before,after)<1e-7)return null;
 const lo=incoming.getTimeAt(incoming.length-before),hi=outgoing.getTimeAt(after);
 const normal=t=>new paper.Point(-t.y,t.x).multiply(side*radius);
 const centre=(curve,t)=>curve.getPointAtTime(t).add(normal(curve.getTangentAtTime(t)));
 const difference=(t,u)=>centre(incoming,t).subtract(centre(outgoing,u));
 const derivative=(curve,t)=>{const a=Math.max(0,t-1e-5),b=Math.min(1,t+1e-5);return centre(curve,b).subtract(centre(curve,a)).divide(b-a);};
 const tolerance=Math.max(1e-7,Math.min(1e-4,radius*1e-7)),roots=[];
 const angle=Math.acos(Math.max(-1,Math.min(1,incoming.getTangentAtTime(1).dot(outgoing.getTangentAtTime(0))))),guess=radius*Math.tan(angle/2);
 const distances=(limit)=>[Math.min(limit*.98,Math.max(limit*.001,guess)),limit*.08,limit*.3,limit*.65,limit*.96];
 for(const d of distances(before))for(const e of distances(after)){
  let t=incoming.getTimeAt(incoming.length-d),u=outgoing.getTimeAt(e);
  for(let iteration=0;iteration<30;iteration++){
   const f=difference(t,u),error=f.length;if(error<tolerance)break;
   const a=derivative(incoming,t),b=derivative(outgoing,u).negate(),det=a.cross(b);
   if(Math.abs(det)<1e-12)break;
   const dt=-f.cross(b)/det,du=-a.cross(f)/det;let improved=false;
   for(let step=1;step>=1/128;step/=2){const nt=Math.max(lo,Math.min(1-1e-9,t+step*dt)),nu=Math.max(1e-9,Math.min(hi,u+step*du));if(difference(nt,nu).length<error){t=nt;u=nu;improved=true;break;}}
   if(!improved)break;
  }
  if(difference(t,u).length>tolerance||t<=lo+1e-8||u>=hi-1e-8||t>=1-1e-8||u<=1e-8)continue;
  const a=incoming.getPointAtTime(t),b=outgoing.getPointAtTime(u),c=centre(incoming,t),ra=a.subtract(c),rb=b.subtract(c);
  let sweep=Math.atan2(ra.cross(rb),ra.dot(rb));if(side*sweep<=0)sweep+=side*2*Math.PI;
  if(Math.abs(sweep)>Math.PI+1e-6||a.getDistance(b)<1e-7)continue;
  // Reject offset cusps: these solutions run against the original curves.
  if(derivative(incoming,t).dot(incoming.getTangentAtTime(t))<=0||derivative(outgoing,u).dot(outgoing.getTangentAtTime(u))<=0)continue;
  const score=incoming.getPartLength(t,1)+outgoing.getPartLength(0,u);
  roots.push({t,u,a,b,centre:c,sweep,score,radius});
 }
 return roots.sort((a,b)=>a.score-b.score)[0]||null;
}

export function rebuildCurvedCorners(paper,path,model,eligible){
 const source=new paper.Path({insert:false,closed:model.closed,segments:model.source.map(s=>{
  const p=new paper.Point(s[0]),point=path.localToGlobal(p);
  return new paper.Segment(point,path.localToGlobal(p.add(s[1])).subtract(point),path.localToGlobal(p.add(s[2])).subtract(point));
 })});
 try{
  const n=source.segments.length,rounds=new Map();
  for(const [key,effect] of Object.entries(model.effects)){
   const i=Number(key);if(!effect.amount||!eligible(model.source,i,model.closed,effect.type))continue;
   const incoming=source.curves[(i+n-1)%n],outgoing=source.curves[i];
   if(effect.type==='chamfer'){
    const d=Math.min(effect.amount,incoming.length/2*(1-1e-5),outgoing.length/2*(1-1e-5));effect.amount=d;
    rounds.set(i,{t:incoming.getTimeAt(incoming.length-d),u:outgoing.getTimeAt(d),chamfer:true});
   }else{
    if(incoming.isStraight()&&outgoing.isStraight()){
     const angle=Math.acos(Math.max(-1,Math.min(1,-incoming.getTangentAtTime(1).dot(outgoing.getTangentAtTime(0)))));
     effect.amount=Math.min(effect.amount,Math.min(incoming.length,outgoing.length)/2*(1-2e-5)*Math.tan(angle/2));
    }
    const result=solveCurvedFillet(paper,incoming,outgoing,effect.amount);
    if(!result)throw Error('This fillet radius does not fit the adjoining curves. Try a smaller radius.');
    rounds.set(i,result);
   }
  }
  // Split each original Bézier exactly. Only its trimmed-off ends are replaced.
  const pieces=source.curves.map((curve,i)=>curve.getPart(rounds.get(i)?.u||0,rounds.get((i+1)%n)?.t??1));
  const segments=[],map=[];
  for(let i=0;i<n;i++){
   const previous=pieces[(i+n-1)%n],next=pieces[i],round=rounds.get(i);
   if(!round){const s=source.segments[i].clone();if(previous)s.handleIn=previous.segment2.handleIn;if(next)s.handleOut=next.segment1.handleOut;segments.push(s);map.push(i);continue;}
   const a=previous.segment2.clone(),b=next.segment1.clone();a.handleOut=[0,0];b.handleIn=[0,0];
   if(round.chamfer){segments.push(a,b);map.push(i,i);continue;}
   const count=Math.ceil(Math.abs(round.sweep)/(Math.PI/2)),step=round.sweep/count,k=4/3*Math.tan(Math.abs(step)/4)*round.radius,side=Math.sign(step);
   model.effects[i].arcAngle=step;
   const arc=[a];
   for(let j=1;j<count;j++)arc.push(new paper.Segment(round.centre.add(round.a.subtract(round.centre).rotate(step*j*180/Math.PI))));
   arc.push(b);
   for(let j=0;j<arc.length;j++){
    const radial=arc[j].point.subtract(round.centre).normalize(),tangent=new paper.Point(-radial.y,radial.x).multiply(side*k);
    if(j>0)arc[j].handleIn=tangent.negate();if(j<count)arc[j].handleOut=tangent;
    segments.push(arc[j]);map.push(i);
   }
  }
  const local=segments.map(s=>{const p=path.globalToLocal(s.point);return new paper.Segment(p,path.globalToLocal(s.point.add(s.handleIn)).subtract(p),path.globalToLocal(s.point.add(s.handleOut)).subtract(p));});
  path.applyMatrix=false;path.removeSegments();path.addSegments(local);path.data.nodeModes=map.map(i=>rounds.has(i)?(model.effects[i].type==='fillet'?'round':'corner'):(model.modes?.[i]||'corner'));
  model.map=map;model.geometry=path.pathData;model.matrix=path.globalMatrix.values;path.data.cornerEffect=model;
  return {curved:true};
 }finally{source.remove();}
}
