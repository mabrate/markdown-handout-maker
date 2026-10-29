// Include faint edge pixels so cropping never cuts off anti-aliased artwork.
export function alphaBounds({data,width,height}){
  let left=width,top=height,right=0,bottom=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  return right>left&&bottom>top?{left,top,right,bottom}:null;
}
