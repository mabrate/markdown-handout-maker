// One glyph layout drives formatted canvas text and outlined SVG exports.
const features={liga:false,rlig:false};
export function textFormat(item){const value=item.data?.textFormat||{};return {italic:value.italic===true,underline:value.underline===true,letterSpacing:Number.isFinite(value.letterSpacing)?Math.max(-200,Math.min(1000,value.letterSpacing)):0,lineSpacing:Number.isFinite(value.lineSpacing)?Math.max(.5,Math.min(5,value.lineSpacing)):1.2};}
export function textWidth(font,line,size,spacing=0){return Math.max(0,font.getAdvanceWidth(line,size,{features,letterSpacing:spacing/size})-(line?spacing:0));}
export function textGeometry(item,loaded){
 const format=textFormat(item),font=loaded.font,size=item.fontSize,outlines=[],underlines=[];let bounds=null;
 const include=box=>{if(!bounds)bounds={...box};else{bounds.x1=Math.min(bounds.x1,box.x1);bounds.y1=Math.min(bounds.y1,box.y1);bounds.x2=Math.max(bounds.x2,box.x2);bounds.y2=Math.max(bounds.y2,box.y2);}};
 item.content.split(/\r\n|\r|\n/).forEach((line,index)=>{
  const width=textWidth(font,line,size,format.letterSpacing),x=item.justification==='center'?-width/2:item.justification==='right'?-width:0,y=index*item.leading;
  const path=font.getPath(line,x,y,size,{features,letterSpacing:format.letterSpacing/size});
  if(loaded.syntheticItalic){const shear=Math.tan(12*Math.PI/180);for(const command of path.commands)for(const [xx,yy] of [['x','y'],['x1','y1'],['x2','y2']])if(Number.isFinite(command[xx]))command[xx]-=(command[yy]-y)*shear;}
  if(path.commands.length){outlines.push(path.toPathData(6));include(path.getBoundingBox());}
  if(format.underline&&width>0){const underline={x,y:y+size*.1,width,height:Math.max(.5,size/16)};underlines.push(underline);include({x1:x,y1:underline.y,x2:x+width,y2:underline.y+underline.height});}
 });
 return {outlines,underlines,bounds:bounds||{x1:0,y1:0,x2:0,y2:0}};
}
export function installFormattedText(paper,library){
 const nativeDraw=paper.PointText.prototype._draw,nativeBounds=paper.PointText.prototype._getBounds,cache=new WeakMap();
 function geometry(item){if(!item.data?.textFormat)return null;const format=textFormat(item),loaded=library.loaded(item.fontFamily,item.fontWeight==='bold'||Number(item.fontWeight)>=600,format.italic);if(!loaded)return null;const key=JSON.stringify([item.content,item.fontFamily,item.fontWeight,item.fontSize,item.leading,item.justification,format]);let saved=cache.get(item);if(!saved||saved.key!==key){const value=textGeometry(item,loaded);saved={key,...value,paths:value.outlines.map(d=>new Path2D(d))};cache.set(item,saved);}return saved;}
 paper.PointText.prototype._draw=function(ctx,param,viewMatrix){const value=geometry(this);if(!value)return nativeDraw.call(this,ctx,param,viewMatrix);this._setStyles(ctx,param,viewMatrix);const fill=this.style.hasFill(),stroke=this.style.hasStroke();for(const path of value.paths){if(fill)ctx.fill(path);if(stroke)ctx.stroke(path);}if(fill||stroke){if(!fill)ctx.fillStyle=ctx.strokeStyle;for(const line of value.underlines)ctx.fillRect(line.x,line.y,line.width,line.height);}};
 paper.PointText.prototype._getBounds=function(matrix,options){const value=geometry(this);if(!value)return nativeBounds.call(this,matrix,options);const b=value.bounds,rect=new paper.Rectangle(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1),expanded=options?.stroke&&this.strokeColor?rect.expand(this.strokeWidth):rect;return matrix?matrix._transformBounds(expanded,expanded):expanded;};
}
