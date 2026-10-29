import paper from 'paper';

export function isObjectGroup(item){return item instanceof paper.Group&&!item.clipped;}

export function groupObjects(parent,items){
  const ordered=[...new Set(items)].filter(item=>item.parent===parent).sort((a,b)=>a.index-b.index);
  if(ordered.length<2)return null;
  const group=new paper.Group({insert:false,applyMatrix:false});group.data.objectGroup=true;
  // Keep the selected objects' relative order and place the group at the
  // topmost selected object's level in the document.
  parent.insertChild(ordered.at(-1).index+1,group);group.addChildren(ordered);
  return group;
}

export function ungroupObjects(parent,items){
  const restored=[];
  for(const item of [...items].sort((a,b)=>a.index-b.index)){
    if(!isObjectGroup(item)||item.parent!==parent){restored.push(item);continue;}
    const index=item.index,inverse=parent.globalMatrix.inverted();
    const children=item.children.map(child=>({child,matrix:inverse.appended(child.globalMatrix)}));
    children.forEach(({child,matrix},offset)=>{
      child.applyMatrix=false;child.matrix=matrix;
      child.opacity*=item.opacity;child.visible=child.visible&&item.visible;
      parent.insertChild(index+offset,child);restored.push(child);
    });item.remove();
  }
  return restored;
}
