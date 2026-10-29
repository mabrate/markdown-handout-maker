import paper from 'paper';

// Components contain geometry and styles only; they are never inserted or rendered.
export function shapeRecord(item){
  return {pathData:item.pathData,matrix:item.matrix.values,
    fill:item.fillColor?.toCSS(true)||null,stroke:item.strokeColor?.toCSS(true)||null,
    strokeWidth:item.strokeWidth,opacity:item.opacity,fillRule:item.fillRule,
    strokeCap:item.strokeCap,strokeJoin:item.strokeJoin,miterLimit:item.miterLimit,
    dashArray:[...item.dashArray],dashOffset:item.dashOffset,strokeScaling:item.strokeScaling,
    visible:item.visible,
    build:item.data.shapeBuild||null};
}
export function restoreShape(record){
  let item=new paper.CompoundPath({pathData:record.pathData,insert:false});
  item=item.reduce();item.remove();item.applyMatrix=false;
  item.matrix=new paper.Matrix(...record.matrix);
  item.fillColor=record.fill;item.strokeColor=record.stroke;
  item.strokeWidth=record.strokeWidth;item.opacity=record.opacity;item.fillRule=record.fillRule;
  // Optional fields keep older downloaded drawings compatible.
  for(const key of ['strokeCap','strokeJoin','miterLimit','dashArray','dashOffset','strokeScaling','visible'])
    if(record[key]!==undefined)item[key]=record[key];
  if(record.build)item.data.shapeBuild=structuredClone(record.build);
  return item;
}
export function transformedBuild(build,matrix){
  return {...build,parts:build.parts.map(record=>{
    const item=restoreShape(record);
    try{item.transform(matrix);return shapeRecord(item);}finally{item.remove();}
  })};
}
export function validBuild(build,depth=0,budget={count:0}){
  if(depth>16||++budget.count>2048||!build||build.version!==1||
    !['unite','subtract','intersect'].includes(build.operation)||!Array.isArray(build.parts)||build.parts.length!==2)return false;
  return build.parts.every(p=>p&&typeof p.pathData==='string'&&p.pathData.length<1e6&&
    /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]+$/.test(p.pathData)&&
    Array.isArray(p.matrix)&&p.matrix.length===6&&p.matrix.every(Number.isFinite)&&
    [p.fill,p.stroke].every(c=>c===null||typeof c==='string'&&c.length<100&&/^[#a-zA-Z0-9.,()%\s+-]+$/.test(c))&&
    Number.isFinite(p.strokeWidth)&&p.strokeWidth>=0&&p.strokeWidth<=100000&&
    Number.isFinite(p.opacity)&&p.opacity>=0&&p.opacity<=1&&['nonzero','evenodd'].includes(p.fillRule)&&
    (p.strokeCap===undefined||['butt','round','square'].includes(p.strokeCap))&&
    (p.strokeJoin===undefined||['miter','round','bevel'].includes(p.strokeJoin))&&
    (p.miterLimit===undefined||Number.isFinite(p.miterLimit)&&p.miterLimit>=0)&&
    (p.dashArray===undefined||Array.isArray(p.dashArray)&&p.dashArray.length<=2048&&p.dashArray.every(v=>Number.isFinite(v)&&v>=0))&&
    (p.dashOffset===undefined||Number.isFinite(p.dashOffset))&&
    (p.strokeScaling===undefined||typeof p.strokeScaling==='boolean')&&
    (p.visible===undefined||typeof p.visible==='boolean')&&
    (!p.build||validBuild(p.build,depth+1,budget)));
}
