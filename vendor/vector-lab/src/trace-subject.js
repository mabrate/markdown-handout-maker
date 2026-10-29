// Subject extraction uses alpha first, otherwise only a dominant plain border
// color. It does not guess objects in photographs with a busy background.
export function subjectSelection(data,width,height,tolerance=20){
  const size=width*height,border=[];
  for(let x=0;x<width;x++){border.push(x);if(height>1)border.push((height-1)*width+x);}
  for(let y=1;y<height-1;y++){border.push(y*width);if(width>1)border.push(y*width+width-1);}
  const transparent=border.filter(i=>data[i*4+3]<128).length;
  if(transparent>=border.length*.25)return {mask:Uint8Array.from({length:size},(_,i)=>Number(data[i*4+3]>=128)),method:'transparency'};
  const bins=new Map();
  for(const i of border){if(data[i*4+3]<128)continue;const rgb=[data[i*4],data[i*4+1],data[i*4+2]],key=rgb.map(v=>Math.floor(v/16)).join(',');let bin=bins.get(key);if(!bin){bin={sum:[0,0,0],count:0};bins.set(key,bin);}bin.count++;rgb.forEach((v,c)=>bin.sum[c]+=v);}
  const dominant=[...bins.values()].sort((a,b)=>b.count-a.count)[0];
  if(!dominant||dominant.count<border.length*.55)return {mask:Uint8Array.from({length:size},(_,i)=>Number(data[i*4+3]>=128)),method:'uncertain'};
  const background=dominant.sum.map(v=>v/dominant.count),limit=(Math.max(0,Math.min(100,tolerance))/100*255)**2*3;
  const outside=new Uint8Array(size),queue=new Int32Array(size);let head=0,tail=0;
  function seed(i){if(outside[i])return;const p=i*4;if(data[p+3]>=128&&background.reduce((sum,v,c)=>sum+(data[p+c]-v)**2,0)>limit)return;outside[i]=1;queue[tail++]=i;}
  border.forEach(seed);
  // Transparent cutouts remain empty, including enclosed holes in PNG images.
  for(let i=0;i<size;i++)if(data[i*4+3]<128)seed(i);
  while(head<tail){const i=queue[head++],x=i%width;for(const n of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width])if(n>=0&&n<size)seed(n);}
  return {mask:Uint8Array.from(outside,v=>1-v),method:'plain background'};
}

export function outlineSelection(mask,width,height,percent=1.5){
  const distance=new Uint16Array(mask.length),far=60000,limit=Math.max(1,Math.min(width,height)*Math.max(.25,Math.min(10,percent))/100)*3;
  for(let i=0;i<mask.length;i++)distance[i]=mask[i]?far:0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!mask[i])continue;distance[i]=Math.min(distance[i],x?distance[i-1]+3:3,y?distance[i-width]+3:3,x&&y?distance[i-width-1]+4:far,x<width-1&&y?distance[i-width+1]+4:far);}
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){const i=y*width+x;if(!mask[i])continue;distance[i]=Math.min(distance[i],x<width-1?distance[i+1]+3:3,y<height-1?distance[i+width]+3:3,x<width-1&&y<height-1?distance[i+width+1]+4:far,x&&y<height-1?distance[i+width-1]+4:far);}
  return Uint8Array.from(mask,(v,i)=>Number(v&&distance[i]<=limit));
}
