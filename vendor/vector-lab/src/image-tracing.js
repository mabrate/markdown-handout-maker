import {subjectSelection,outlineSelection} from './trace-subject.js';
import {prepareContour,fitContour} from './trace-curves.js';
// Browser-independent tracing: color reduction, four-connected contour following,
// shared-boundary simplification and curve fitting. Output is filled, closed paths.
export const TRACE_PRESETS={
  simple:{label:'Simple',resolution:512,tolerance:1.5,maxNodes:1000,maxContours:120},
  balanced:{label:'Balanced',resolution:640,tolerance:.8,maxNodes:2000,maxContours:240},
  detailed:{label:'Detailed',resolution:768,tolerance:.35,maxNodes:5000,maxContours:500}
};

function colorPalette(data,width,height,count,ignoreWhite){
  const bins=new Map(),interiors=new Map();let eligible=0,flat=0;
  for(let i=0;i<data.length;i+=4){
    const alpha=data[i+3]/255;if(alpha<.5)continue;
    const rgb=[0,1,2].map(c=>data[i+c]*alpha+255*(1-alpha));
    if(ignoreWhite&&Math.min(...rgb)>=245)continue;
    const key=(Math.floor(rgb[0]/8)<<10)|(Math.floor(rgb[1]/8)<<5)|Math.floor(rgb[2]/8);
    function add(map){let bin=map.get(key);if(!bin){bin={rgb:[0,0,0],count:0};map.set(key,bin);}bin.count++;for(let c=0;c<3;c++)bin.rgb[c]+=rgb[c];}
    add(bins);eligible++;
    const pixel=i/4,x=pixel%width,y=Math.floor(pixel/width);
    if(x>0&&x<width-1&&y>0&&y<height-1&&[-1,1,-width,width].every(offset=>{const n=(pixel+offset)*4,a=data[n+3]/255;return a>=.5&&rgb.every((value,c)=>Math.abs(value-(data[n+c]*a+255*(1-a)))<=12);})){add(interiors);flat++;}
  }
  // Flat artwork's blended boundary pixels are not extra paint colors. Use
  // stable interior samples when enough exist, with a full-image fallback for
  // texture or tiny images that do not have reliable flat interiors.
  const samples=[...(flat>=eligible*.2&&interiors.size?interiors:bins).values()].map(b=>({rgb:b.rgb.map(v=>v/b.count),count:b.count}));
  if(!samples.length)return [];
  samples.sort((a,b)=>b.count-a.count);
  const centers=[samples[0].rgb.slice()],weights=[samples[0].count];
  const distance=(a,b)=>a.reduce((sum,v,c)=>sum+(v-b[c])**2,0);
  while(centers.length<Math.min(count,samples.length)){
    let best=null,score=0;
    for(const sample of samples){const distances=centers.map(center=>distance(center,sample.rgb)),nearest=Math.min(...distances),index=distances.indexOf(nearest);
      // Do not spend palette slots on rare, near-identical shades created by
      // antialiasing. Substantial neighboring flat-color regions still count.
      if(nearest<3*12**2&&sample.count<weights[index]*.1)continue;
      const d=nearest*Math.sqrt(sample.count);if(d>score){score=d;best=sample;}
    }
    if(!best||score<1)break;centers.push(best.rgb.slice());weights.push(best.count);
  }
  for(let iteration=0;iteration<8;iteration++){
    const sums=centers.map(()=>({rgb:[0,0,0],count:0}));
    for(const sample of samples){let index=0,best=Infinity;centers.forEach((center,i)=>{const d=distance(center,sample.rgb);if(d<best){best=d;index=i;}});const sum=sums[index];sum.count+=sample.count;for(let c=0;c<3;c++)sum.rgb[c]+=sample.rgb[c]*sample.count;}
    sums.forEach((sum,i)=>{if(sum.count)centers[i]=sum.rgb.map(v=>v/sum.count);});
  }
  // Use the dominant source bin in each cluster, keeping flat logo colors
  // intact instead of tinting them with resampled edge/background pixels.
  const dominant=centers.map(()=>null);
  for(const sample of samples){let index=0,best=Infinity;centers.forEach((center,i)=>{const d=distance(center,sample.rgb);if(d<best){best=d;index=i;}});if(!dominant[index]||sample.count>dominant[index].count)dominant[index]=sample;}
  const colors=centers.map((rgb,i)=>({rgb:(dominant[i]?.rgb||rgb).map(Math.round),count:dominant[i]?.count||0}));
  return colors.filter((color,i)=>!colors.some((other,j)=>j!==i&&other.count>color.count*4&&distance(color.rgb,other.rgb)<3*12**2)).map(color=>color.rgb);
}

function cleanColorEdges(labels,data,width,height,amount){
  if(amount<=0)return;
  const stable=new Uint8Array(labels.length),original=labels.slice(),radius=Math.max(2,Math.ceil(amount/25)+1);
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    stable[i]=Number([-1,1,-width,width].every(offset=>[0,1,2,3].every(c=>Math.abs(data[i*4+c]-data[(i+offset)*4+c])<=12)));
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(stable[i]||original[i]<0)continue;
    const candidates=new Set();for(let yy=Math.max(0,y-radius);yy<=Math.min(height-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(width-1,x+radius);xx++){const j=yy*width+xx;if(stable[j])candidates.add(original[j]);}
    if(candidates.size<2||candidates.has(original[i]))continue;
    // A blended pixel between red and blue may look purple, but it should
    // belong to an adjacent region, not introduce an unrelated purple stripe.
    let best=Infinity;
    for(let yy=Math.max(0,y-radius);yy<=Math.min(height-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(width-1,x+radius);xx++){
      const j=yy*width+xx;if(!stable[j]||original[j]<0)continue;
      let distance=0;for(let c=0;c<3;c++)distance+=(data[i*4+c]-data[j*4+c])**2;
      if(distance<best){best=distance;labels[i]=original[j];}
    }
  }
}

function signedArea(points){let area=0;for(let i=0,j=points.length-1;i<points.length;j=i++)area+=points[j][0]*points[i][1]-points[i][0]*points[j][1];return area/2;}

function simplifyChain(points,tolerance){
  const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;
  const stack=[[0,points.length-1]],limit=tolerance*tolerance;
  while(stack.length){const [start,end]=stack.pop(),a=points[start],b=points[end],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;let best=limit,index=-1;
    for(let i=start+1;i<end;i++){const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0,d=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;if(d>best){best=d;index=i;}}
    if(index!==-1){keep[index]=1;stack.push([start,index],[index,end]);}
  }
  return points.filter((_,i)=>keep[i]);
}

function simplifyClosed(points,tolerance){
  // Retain corners while dropping every redundant point on a straight edge.
  const corners=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});
  if(corners.length<=4)return corners;
  let split=1,distance=0;const a=corners[0];
  for(let i=1;i<corners.length;i++){const d=(corners[i][0]-a[0])**2+(corners[i][1]-a[1])**2;if(d>distance){distance=d;split=i;}}
  const first=simplifyChain(corners.slice(0,split+1),tolerance),second=simplifyChain([...corners.slice(split),corners[0]],tolerance);
  const result=[...first.slice(0,-1),...second.slice(0,-1)];
  // A tiny hole must stay a hole, rather than collapsing into a line or flipping.
  return result.length>=3&&signedArea(result)*signedArea(corners)>0?result:corners;
}

function removeSpecks(labels,width,height,minArea){
  if(minArea<=1)return 0;
  const visited=new Uint8Array(labels.length),queue=new Int32Array(labels.length);let removed=0;
  for(let start=0;start<labels.length;start++){
    if(labels[start]<0||visited[start])continue;
    let head=0,tail=0;queue[tail++]=start;visited[start]=1;const color=labels[start];
    while(head<tail){const i=queue[head++],x=i%width;for(const n of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width])if(n>=0&&n<labels.length&&!visited[n]&&labels[n]===color){visited[n]=1;queue[tail++]=n;}}
    if(tail<minArea){
      removed++;const neighbors=new Map();
      for(let k=0;k<tail;k++){const i=queue[k],x=i%width;for(const n of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width])if(n>=0&&n<labels.length&&labels[n]!==color)neighbors.set(labels[n],(neighbors.get(labels[n])||0)+1);}
      let replacement=-1,best=0;for(const [label,count] of neighbors)if(count>best){best=count;replacement=label;}
      for(let i=0;i<tail;i++)labels[queue[i]]=replacement;
    }
  }
  return removed;
}

function fillInteriorHoles(labels,data,width,height){
  // Flood only background reachable from an edge or transparent source pixels.
  // The remainder is enclosed whitespace; fill it without changing threshold.
  const outside=new Uint8Array(labels.length),queue=new Int32Array(labels.length);
  let head=0,tail=0;
  function seed(i){if(labels[i]<0&&!outside[i]){outside[i]=1;queue[tail++]=i;}}
  for(let x=0;x<width;x++){seed(x);seed((height-1)*width+x);}
  for(let y=0;y<height;y++){seed(y*width);seed(y*width+width-1);}
  for(let i=0;i<labels.length;i++)if(data[i*4+3]<128)seed(i);
  function spread(mark){while(head<tail){const i=queue[head++],x=i%width;
    for(const n of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width])if(n>=0&&n<labels.length&&labels[n]<0&&!outside[n]){outside[n]=1;if(mark)labels[n]=0;queue[tail++]=n;}
  }}
  spread(false);let holes=0;
  for(let i=0;i<labels.length;i++)if(labels[i]<0&&!outside[i]){holes++;head=0;tail=0;outside[i]=1;labels[i]=0;queue[tail++]=i;spread(true);}
  return holes;
}

function contoursForColor(labels,width,height,color,minArea){
  const stride=width+1,edges=new Uint8Array(stride*(height+1));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(labels[i]!==color)continue;
    if(y===0||labels[i-width]!==color)edges[y*stride+x]|=1;
    if(x===width-1||labels[i+1]!==color)edges[y*stride+x+1]|=2;
    if(y===height-1||labels[i+width]!==color)edges[(y+1)*stride+x+1]|=4;
    if(x===0||labels[i-1]!==color)edges[(y+1)*stride+x]|=8;
  }
  const offsets=[1,stride,-1,-stride],contours=[];let removed=0;
  for(let start=0;start<edges.length;start++)while(edges[start]){
    let vertex=start,direction=[0,1,2,3].find(d=>edges[start]&(1<<d));const points=[];
    do{
      points.push([vertex%stride,Math.floor(vertex/stride)]);edges[vertex]&=~(1<<direction);vertex+=offsets[direction];
      // At diagonal contacts, turn right to keep distinct regions separate.
      const next=[(direction+1)%4,direction,(direction+3)%4,(direction+2)%4].find(d=>edges[vertex]&(1<<d));
      if(vertex===start)break;
      if(next===undefined)throw Error('Could not close an image outline. Try a simpler trace.');
      direction=next;
    }while(true);
    const area=signedArea(points);
    if(Math.abs(area)>=Math.max(1,minArea)){contours.push(points);}else removed++;
    if(contours.length>6000)throw Error('Too many small outlines. Increase noise removal or use black and white.');
  }
  return {contours,removed};
}

// Average each grid cell before reducing colors; output exact rectangular paths.
function pixelArt({data,width,height,overrides},settings){
  const size=[16,24,32,48,64,128].includes(Number(settings.pixelSize))?Number(settings.pixelSize):32;
  const block=settings.pixelSizing==='block';
  const blockSize=Number(settings.blockSize??4),artWidth=Number(settings.artworkWidth??width),artHeight=Number(settings.artworkHeight??height);
  if(block&&(!Number.isFinite(blockSize)||blockSize<1||blockSize>256||!Number.isFinite(artWidth)||artWidth<=0||!Number.isFinite(artHeight)||artHeight<=0))throw Error('Choose a block size from 1 to 256 px.');
  let left=width,top=height,right=0,bottom=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(overrides?.[i]!==2&&data[i*4+3]>=128){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}}
  if(right<=left||bottom<=top)return {width,height,gridWidth:0,gridHeight:0,shapes:[],nodes:0,contourCount:0,selection:new Uint8Array(width*height),tooComplex:false,pixelArt:true,removed:0};
  const spanX=right-left,spanY=bottom-top,scale=Math.min(1,size/Math.max(spanX,spanY));
  const stepX=block?blockSize*width/artWidth:spanX/Math.max(1,Math.round(spanX*scale));
  const stepY=block?blockSize*height/artHeight:spanY/Math.max(1,Math.round(spanY*scale));
  const w=Math.max(1,Math.ceil(spanX/stepX-1e-9)),h=Math.max(1,Math.ceil(spanY/stepY-1e-9));
  if(w>512||h>512||w*h>65536)throw Error('Too many blocks. Choose a larger block size or make the image smaller first.');
  const edgeX=x=>Math.min(right,left+x*stepX),edgeY=y=>Math.min(bottom,top+y*stepY);
  const pixels=new Uint8ClampedArray(w*h*4),marks=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const sum=[0,0,0];let alpha=0,count=0,include=0,exclude=0;
    for(let yy=Math.floor(edgeY(y));yy<Math.max(Math.floor(edgeY(y))+1,Math.ceil(edgeY(y+1)));yy++)for(let xx=Math.floor(edgeX(x));xx<Math.max(Math.floor(edgeX(x))+1,Math.ceil(edgeX(x+1)));xx++){
      const i=yy*width+xx,a=data[i*4+3]/255;for(let c=0;c<3;c++)sum[c]+=data[i*4+c]*a;alpha+=a;count++;
      if(overrides?.[i]===1)include++;if(overrides?.[i]===2)exclude++;
    }
    const i=y*w+x;for(let c=0;c<3;c++)pixels[i*4+c]=alpha?Math.round(sum[c]/alpha):0;
    pixels[i*4+3]=Math.round(alpha/count*255);marks[i]=exclude>count/2?2:include>count/2?1:0;
  }
  const count=[2,4,8,12,16].includes(Number(settings.colors))?Number(settings.colors):4;
  const palette=colorPalette(pixels,w,h,count,settings.ignoreWhite!==false),labels=new Int8Array(w*h).fill(-1);
  for(let i=0;i<labels.length;i++){
    const rgb=Array.from(pixels.slice(i*4,i*4+3));
    if(marks[i]===2||pixels[i*4+3]<128||(marks[i]!==1&&settings.ignoreWhite!==false&&Math.min(...rgb)>=245))continue;
    let best=Infinity;palette.forEach((color,index)=>{const distance=color.reduce((n,v,c)=>n+(v-rgb[c])**2,0);if(distance<best){best=distance;labels[i]=index;}});
  }
  let contourCount=0;
  const shapes=palette.map((rgb,index)=>{
    const contours=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(labels[y*w+x]===index){
      const start=x;while(x+1<w&&labels[y*w+x+1]===index)x++;
      contours.push([[edgeX(start),edgeY(y)],[edgeX(x+1),edgeY(y)],[edgeX(x+1),edgeY(y+1)],[edgeX(start),edgeY(y+1)]]);
    }
    contourCount+=contours.length;return {fill:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),contours};
  }).filter(shape=>shape.contours.length);
  const selection=new Uint8Array(width*height);
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const gx=Math.min(w-1,Math.floor((x-left)/stepX)),gy=Math.min(h-1,Math.floor((y-top)/stepY));selection[y*width+x]=Number(labels[gy*w+gx]>=0);}
  return {width,height,gridWidth:w,gridHeight:h,shapes,nodes:contourCount*4,contourCount,selection,tooComplex:false,pixelArt:true,removed:0};
}

export function traceImage({data,width,height,overrides},settings={}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>768||height>768||data.length!==width*height*4)throw Error('The trace preview is too large or invalid.');
  if(overrides&&overrides.length!==width*height)throw Error('Trace corrections do not match the image.');
  if(settings.mode==='pixel')return pixelArt({data,width,height,overrides},settings);
  const preset=TRACE_PRESETS[settings.preset]||TRACE_PRESETS.simple,mode=['color','silhouette','outline'].includes(settings.mode)?settings.mode:'mono';
  const threshold=Math.max(0,Math.min(255,Number(settings.threshold??128))),invert=!!settings.invert,ignoreWhite=settings.ignoreWhite!==false;
  const colorCount=[2,4,8,12,16].includes(Number(settings.colors))?Number(settings.colors):4;
  const smoothing=Math.max(0,Math.min(100,Number(settings.smoothing??70)));
  const palette=mode!=='color'?[[0,0,0]]:colorPalette(data,width,height,colorCount,ignoreWhite),labels=new Int8Array(width*height);labels.fill(-1);
  const subject=mode==='silhouette'||mode==='outline'||mode==='mono'?subjectSelection(data,width,height,Number(settings.backgroundTolerance??20)):null;
  for(let i=0;i<labels.length;i++){
    if(mode==='silhouette'||mode==='outline'){if(subject.mask[i])labels[i]=0;continue;}
    const p=i*4,alpha=data[p+3]/255;if(alpha<.5)continue;
    const rgb=[0,1,2].map(c=>data[p+c]*alpha+255*(1-alpha));
    if(mode==='mono'){const light=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;if(invert?light>=threshold:light<=threshold)labels[i]=0;}
    else if(palette.length&&!(ignoreWhite&&Math.min(...rgb)>=245)){
      let best=Infinity;palette.forEach((color,index)=>{const d=rgb.reduce((sum,v,c)=>sum+(v-color[c])**2,0);if(d<best){best=d;labels[i]=index;}});
    }
  }
  if(mode==='color')cleanColorEdges(labels,data,width,height,smoothing);
  // Noise size is normalized to the image area, independent of preview resolution.
  const noise=Math.max(0,Math.min(100,Number(settings.noise??12))),minArea=noise===0?0:Math.max(2,Math.round(width*height*noise/100000));
  let removed=removeSpecks(labels,width,height,minArea),contourCount=0,correctedPixels=0;
  if(overrides&&overrides.length!==labels.length)throw Error('Trace corrections do not match the image.');
  if(overrides?.some(value=>value===1)&&!palette.length)palette.push([0,0,0]);
  function applyCorrections(){
    if(!overrides)return;
    for(let i=0;i<labels.length;i++){
      if(overrides[i]===2)labels[i]=-1;
      else if(overrides[i]===1){
        if(mode!=='color')labels[i]=0;
        else{let best=Infinity;palette.forEach((color,index)=>{const d=color.reduce((sum,v,c)=>sum+(v-data[i*4+c])**2,0);if(d<best){best=d;labels[i]=index;}});}
      }
    }
  }
  applyCorrections();
  const holesFilled=mode!=='color'&&settings.fillHoles?fillInteriorHoles(labels,data,width,height):0;
  // Explicit exclusions stay empty even when automatic hole filling is enabled.
  applyCorrections();
  if(overrides)for(const value of overrides)if(value===1||value===2)correctedPixels++;
  const subjectArea=Uint8Array.from(labels,v=>Number(v>=0));
  if(mode==='outline'){const border=outlineSelection(Uint8Array.from(labels,v=>Number(v>=0)),width,height,Number(settings.outlineWidth??1.5));for(let i=0;i<labels.length;i++)labels[i]=border[i]?0:-1;}
  const selection=mode==='outline'?subjectArea:Uint8Array.from(labels,value=>Number(value>=0));
  const stackColors=mode==='color'&&settings.stackColors!==false;
  const counts=palette.map((_,i)=>labels.reduce((sum,v)=>sum+Number(v===i),0)),order=palette.map((_,i)=>i).filter(i=>counts[i]>0).sort((a,b)=>counts[b]-counts[a]),rank=new Map(order.map((color,i)=>[color,i]));
  const raw=(stackColors?order:palette.map((_,i)=>i)).map((index,layer)=>{const rgb=palette[index],layerLabels=stackColors?Int8Array.from(labels,v=>v>=0&&rank.get(v)>=layer?0:-1):labels;const result=contoursForColor(layerLabels,width,height,stackColors?0:index,correctedPixels?0:minArea);removed+=result.removed;contourCount+=result.contours.length;return {fill:'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''),contours:result.contours.map(points=>prepareContour(points,labels,width,height,smoothing))};}).filter(shape=>shape.contours.length);
  let shapes=[],nodes=0,tolerance=preset.tolerance,adjusted=false;
  for(let attempt=0;attempt<7;attempt++){
    shapes=raw.map(shape=>{const fitted=shape.contours.map(contour=>fitContour(contour,Math.max(tolerance,smoothing/100*.9),smoothing,simplifyClosed,simplifyChain));return {fill:shape.fill,contours:fitted.map(c=>c.points),segments:fitted.map(c=>c.segments)};});
    nodes=shapes.reduce((sum,shape)=>sum+shape.contours.reduce((n,points)=>n+points.length,0),0);
    if(nodes<=preset.maxNodes)break;tolerance*=1.5;adjusted=true;
  }
  const tooComplex=nodes>preset.maxNodes||contourCount>preset.maxContours;
  const foreground=subject?.mask.reduce((sum,v)=>sum+v,0)||0,selectedPixels=selection.reduce((sum,v)=>sum+v,0);
  return {width,height,shapes,nodes,contourCount,removed,holesFilled,correctedPixels,selection,adjusted,tooComplex,stackColors,subjectMethod:subject?.method,recommendSilhouette:mode==='mono'&&subject?.method!=='uncertain'&&foreground>selectedPixels*1.8&&foreground>width*height*.01,maxNodes:preset.maxNodes,maxContours:preset.maxContours};
}

export function tracePathData(contours,segments){
  if(!segments)return contours.map(points=>'M'+points.map(p=>p.join(' ')).join('L')+'Z').join('');
  const format=point=>point.map(v=>Number(v.toFixed(6))).join(' ');
  return segments.map(loop=>{let d='M'+format(loop[0][0]);for(let i=0;i<loop.length;i++){const [p,,out]=loop[i],[q,into]=loop[(i+1)%loop.length];d+=out.some(Boolean)||into.some(Boolean)?'C'+format([p[0]+out[0],p[1]+out[1]])+' '+format([q[0]+into[0],q[1]+into[1]])+' '+format(q):'L'+format(q);}return d+'Z';}).join('');
}

// Vector bucket fills already have a binary region, so skip palette reduction
// and preview image limits. Bound memory and output complexity independently.
export function traceBinaryRegion(selection,width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||selection.length!==width*height)throw Error('The fill area is too large.');
  const labels=Int16Array.from(selection,v=>v?0:-1),raw=contoursForColor(labels,width,height,0,0).contours;
  const fitted=raw.map(points=>fitContour(prepareContour(points,labels,width,height,70),.63,70,simplifyClosed,simplifyChain));
  const nodes=fitted.reduce((n,c)=>n+c.points.length,0);
  return {segments:fitted.map(c=>c.segments),tooComplex:nodes>5000||fitted.length>500};
}
