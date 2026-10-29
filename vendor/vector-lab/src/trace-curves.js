function area(points){return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;}

// Canonical orientation and starting point give opposite sides of a shared
// color boundary the same simplification, rather than independent seams.
export function canonicalContour(points){
  const reversed=area(points)<0,ordered=reversed?points.slice().reverse():points.slice();let start=0;
  for(let i=1;i<ordered.length;i++)if(ordered[i][1]<ordered[start][1]||ordered[i][1]===ordered[start][1]&&ordered[i][0]<ordered[start][0])start=i;
  return {points:[...ordered.slice(start),...ordered.slice(0,start)],reversed};
}

export function smoothContour(points,amount,closed=true){
  if(amount<=0||points.length<16)return points;
  const n=points.length,base=Math.max(1,Math.round(amount/100*3)),cleanup=Math.max(0,(amount-70)/30);
  // The upper end removes multi-pixel stair steps instead of merely rounding
  // their individual corners. Scale the window down on small features/arcs.
  const radius=Math.min(base+Math.round(29*cleanup*cleanup),Math.max(base,Math.floor(n/24))),look=cleanup?Math.max(Math.min(8,Math.floor(n/32)),radius):Math.min(8,Math.floor(n/32)),mix=amount/100;
  return points.map((p,i)=>{
    const at=index=>points[closed?(index+n)%n:Math.max(0,Math.min(n-1,index))];
    if(!closed&&(i===0||i===n-1))return p;
    const before=at(i-look),after=at(i+look),a=[p[0]-before[0],p[1]-before[1]],b=[after[0]-p[0],after[1]-p[1]],length=Math.hypot(...a)*Math.hypot(...b);
    // Preserve deliberate corners and short features. Average the staircase
    // only where the contour keeps moving in approximately the same direction.
    if(!length||(a[0]*b[0]+a[1]*b[1])/length<Math.cos(Math.PI/3))return p;
    let x=0,y=0,total=0;
    for(let offset=-radius;offset<=radius;offset++){const q=at(i+offset),weight=radius+1-Math.abs(offset);x+=q[0]*weight;y+=q[1]*weight;total+=weight;}
    return [Number((p[0]*(1-mix)+x/total*mix).toFixed(6)),Number((p[1]*(1-mix)+y/total*mix).toFixed(6))];
  });
}

export function curveSegments(points,amount,closed=true,source=points){
  const strength=Math.min(1,amount/50),lookup=new Map(source.map((p,i)=>[p,i]));
  const turns=points.map((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return (p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]);}).filter(v=>Math.abs(v)>1e-4);
  const convex=closed&&(turns.every(v=>v>0)||turns.every(v=>v<0)),perimeter=points.reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[(i+1)%points.length][0],p[1]-points[(i+1)%points.length][1]),0);
  const segments=points.map((p,i)=>{
    if(!closed&&(i===0||i===points.length-1))return [p,[0,0],[0,0]];
    const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length],la=Math.hypot(p[0]-previous[0],p[1]-previous[1]),lb=Math.hypot(next[0]-p[0],next[1]-p[1]);
    // Estimate the tangent from the original contour, not the unevenly spaced
    // simplified anchors. Different incoming/outgoing lengths must not tilt it.
    const index=lookup.get(p),look=Math.max(3,Math.min(8,Math.floor(source.length/24))),at=j=>source[closed?(j+source.length)%source.length:Math.max(0,Math.min(source.length-1,j))];
    const before=index===undefined?previous:at(index-look),after=index===undefined?next:at(index+look),a=[p[0]-before[0],p[1]-before[1]],b=[after[0]-p[0],after[1]-p[1]],al=Math.hypot(...a),bl=Math.hypot(...b),cos=al&&bl?(a[0]*b[0]+a[1]*b[1])/(al*bl):-1;
    if(!strength||cos<Math.cos(Math.PI*5/12)||!la||!lb)return [p,[0,0],[0,0]];
    const direction=a.map((v,c)=>v/al+b[c]/bl),length=Math.hypot(...direction);
    if(!length)return [p,[0,0],[0,0]];
    return [p,direction.map(v=>-v/length*la/3*strength),direction.map(v=>v/length*lb/3*strength)];
  });
  // A long straight raster run is evidence for a line, even when either end
  // meets a curve or an acute corner. Do not let neighboring tangents bow it.
  for(let i=0;i<(closed?points.length:points.length-1);i++){
    const j=(i+1)%points.length,p=points[i],q=points[j],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy),start=lookup.get(p),end=lookup.get(q);
    if(length<20||start===undefined||end===undefined)continue;
    const chain=[];
    for(let k=start;;k=(k+1)%source.length){chain.push(source[k]);if(k===end||chain.length>source.length)break;}
    // Rounded raster joins can move the simplified endpoints off the line.
    // Judge the straight run itself, excluding the small join at either end.
    const trim=Math.min(8,Math.floor(chain.length*.1)),run=chain.slice(trim,chain.length-trim),u=run[0],v=run.at(-1),vx=v[0]-u[0],vy=v[1]-u[1],span=Math.hypot(vx,vy);
    if(span<8)continue;
    const distances=run.map(p=>(vx*(p[1]-u[1])-vy*(p[0]-u[0]))/span),mean=distances.reduce((sum,d)=>sum+d,0)/distances.length;
    const max=Math.max(...distances.map(d=>Math.abs(d-mean))),rms=Math.sqrt(distances.reduce((sum,d)=>sum+(d-mean)**2,0)/distances.length);
    const bends=handle=>{const h=Math.hypot(...handle);return !h||Math.abs(dx*handle[1]-dy*handle[0])/(length*h)>Math.sin(Math.PI/12);};
    if(max<=.75&&rms<=.3){
      if(bends(segments[i][2])||bends(segments[j][1])){segments[i][2]=[0,0];segments[j][1]=[0,0];}
      else if(!convex||length>perimeter*.22){
        // A small tangent error still bows a long line. Align both handles at
        // a smooth join, keeping its cap/neighbor tangent continuous rather
        // than introducing a corner by deleting just one of the handles.
        for(const index of [i,j])for(const [key,sign] of [[1,-1],[2,1]]){const h=Math.hypot(...segments[index][key]);segments[index][key]=[dx/length*h*sign,dy/length*h*sign];}
      }
    }
  }
  return segments;
}

// A junction splits a contour into shared open arcs. Each arc is smoothed in
// one deterministic direction, so adjoining colors meet exactly, even when
// they share only part of their outlines.
export function prepareContour(points,labels,width,height,amount){
  function isJunction([x,y]){
    const colors=new Set();for(const yy of [y-1,y])for(const xx of [x-1,x])colors.add(xx<0||xx>=width||yy<0||yy>=height?-1:labels[yy*width+xx]);
    return colors.size>=3;
  }
  const anchors=[];points.forEach((p,i)=>{if(isJunction(p))anchors.push(i);});
  if(!anchors.length){const canonical=canonicalContour(points);return {closed:true,reversed:canonical.reversed,points:smoothContour(canonical.points,amount)};}
  if(anchors.length===1){let best=-1,split=0;const a=points[anchors[0]];for(let i=0;i<points.length;i++){const d=(points[i][0]-a[0])**2+(points[i][1]-a[1])**2;if(d>best){best=d;split=i;}}anchors.push(split);anchors.sort((a,b)=>a-b);}
  const arcs=anchors.map((start,index)=>{
    const end=anchors[(index+1)%anchors.length],arc=[];for(let i=start;;i=(i+1)%points.length){arc.push(points[i]);if(i===end)break;}
    const a=arc[0],b=arc.at(-1),reversed=a[1]>b[1]||a[1]===b[1]&&a[0]>b[0];
    return {reversed,points:smoothContour(reversed?arc.reverse():arc,amount,false)};
  });
  return {closed:false,arcs};
}

function boundedCurves(points,source,tolerance,amount,closed){
  if(!amount)return {points,segments:curveSegments(points,amount,closed,source)};
  const lookup=new Map(source.map((p,i)=>[p,i])),limit=Math.max(.75,tolerance)**2;
  for(let pass=0;pass<5;pass++){
    const segments=curveSegments(points,amount,closed,source),refined=[];let changed=false;
    for(let i=0;i<points.length;i++){
      refined.push(points[i]);if(!closed&&i===points.length-1)continue;
      const j=(i+1)%points.length,start=lookup.get(points[i]),end=lookup.get(points[j]);if(start===undefined||end===undefined)continue;
      const chain=[];for(let k=start;;k=(k+1)%source.length){chain.push(source[k]);if(k===end||chain.length>source.length)break;}if(chain.length<4)continue;
      const [p,,out]=segments[i],[q,into]=segments[j];let worst=limit,split=-1;
      for(let step=1;step<8;step++){
        const t=step/8,u=1-t,point=p.map((v,c)=>u*u*u*v+3*u*u*t*(v+out[c])+3*u*t*t*(q[c]+into[c])+t*t*t*q[c]);let nearest=Infinity,index=0;
        for(let k=0;k<chain.length-1;k++){const a=chain[k],b=chain[k+1],dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy,v=len?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/len)):0,d=(point[0]-a[0]-v*dx)**2+(point[1]-a[1]-v*dy)**2;if(d<nearest){nearest=d;index=k+(v>.5?1:0);}}
        if(nearest>worst){worst=nearest;split=index;}
      }
      if(split>=0){if(split===0||split===chain.length-1)split=Math.floor(chain.length/2);refined.push(chain[split]);changed=true;}
    }
    if(!changed)return {points,segments};points=refined;
  }
  return {points,segments:curveSegments(points,amount,closed,source)};
}

export function fitContour(prepared,tolerance,amount,simplifyClosed,simplifyChain){
  if(prepared.closed){let points=simplifyClosed(prepared.points,tolerance);if(prepared.reversed)points=[points[0],...points.slice(1).reverse()];return boundedCurves(points,prepared.reversed?prepared.points.slice().reverse():prepared.points,tolerance,amount,true);}
  const segments=[];
  for(const arc of prepared.arcs){const points=simplifyChain(arc.points,tolerance);let fitted=boundedCurves(points,arc.points,tolerance,amount,false).segments;if(arc.reversed)fitted=fitted.reverse().map(([p,into,out])=>[p,out,into]);segments.push(...fitted.slice(0,-1));}
  return {points:segments.map(s=>s[0]),segments};
}
