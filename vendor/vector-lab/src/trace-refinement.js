// Corrections use the original preview's pixel grid, so they survive retracing
// with a different threshold, palette, or resolution. 0=automatic, 1=include,
// 2=exclude. The image itself is never changed.
export function createTraceRefinement(width,height){
  const mask=new Uint8Array(width*height);
  function brush(x,y,radius,value){
    for(let yy=Math.max(0,Math.floor(y-radius));yy<=Math.min(height-1,Math.ceil(y+radius));yy++)
      for(let xx=Math.max(0,Math.floor(x-radius));xx<=Math.min(width-1,Math.ceil(x+radius));xx++)
        if((xx-x)**2+(yy-y)**2<=radius*radius)mask[yy*width+xx]=value;
  }
  function removeSpot(x,y,selection,sampleWidth,sampleHeight){
    const selected=i=>selection[Math.min(sampleHeight-1,Math.floor(Math.floor(i/width)*sampleHeight/height))*sampleWidth+Math.min(sampleWidth-1,Math.floor(i%width*sampleWidth/width))]>0;
    const start=Math.max(0,Math.min(height-1,Math.floor(y)))*width+Math.max(0,Math.min(width-1,Math.floor(x)));
    if(!selected(start))return false;
    const visited=new Uint8Array(mask.length),queue=new Int32Array(mask.length);let head=0,tail=0;visited[start]=1;queue[tail++]=start;
    while(head<tail){const i=queue[head++],xx=i%width;mask[i]=2;
      for(const n of [xx>0?i-1:-1,xx<width-1?i+1:-1,i-width,i+width])if(n>=0&&n<mask.length&&!visited[n]&&selected(n)){visited[n]=1;queue[tail++]=n;}
    }
    return true;
  }
  function sample(sampleWidth,sampleHeight){
    const output=new Uint8Array(sampleWidth*sampleHeight);
    for(let y=0;y<sampleHeight;y++)for(let x=0;x<sampleWidth;x++)output[y*sampleWidth+x]=mask[Math.min(height-1,Math.floor((y+.5)*height/sampleHeight))*width+Math.min(width-1,Math.floor((x+.5)*width/sampleWidth))];
    return output;
  }
  return {mask,brush,removeSpot,sample};
}
