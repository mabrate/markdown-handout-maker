export function linePattern(item){const dash=item.dashArray||[],w=Math.max(item.strokeWidth||0,0.01),near=(a,b)=>Math.abs(a-b)<1e-6;if(!dash.length)return 'solid';if(dash.length===2&&near(dash[0],4*w)&&near(dash[1],2*w))return 'dashed';if(item.strokeCap==='round'&&dash.length===2&&near(dash[0],0)&&near(dash[1],3*w))return 'dotted';return 'custom';}
export function patternDashes(pattern,width){const w=Math.max(width,0.01);return pattern==='dashed'?[4*w,2*w]:pattern==='dotted'?[0,3*w]:[];}
export function resizeStroke(item,width){const pattern=linePattern(item);item.strokeWidth=width;if(pattern!=='custom')item.dashArray=patternDashes(pattern,width);}
export function installStrokeControls({getSelection,getWidth,commit}){
 const cap=document.getElementById('stroke-cap'),pattern=document.getElementById('stroke-pattern');let customDash=[],customOffset=0;
 const items=()=>getSelection().filter(i=>!i.data.image);
 function sync(){const selection=items();if(selection.length===1){const item=selection[0];cap.value=item.strokeCap||'butt';pattern.value=linePattern(item);if(pattern.value==='custom'){customDash=[...item.dashArray];customOffset=item.dashOffset;}}cap.disabled=pattern.value==='dotted';}
 function style(){return {strokeCap:pattern.value==='dotted'?'round':cap.value,dashArray:pattern.value==='custom'?[...customDash]:patternDashes(pattern.value,getWidth()),dashOffset:pattern.value==='custom'?customOffset:0};}
 cap.onchange=()=>{items().forEach(item=>item.strokeCap=cap.value);commit();};
 pattern.onchange=()=>{const mode=pattern.value;items().forEach(item=>{item.dashArray=mode==='custom'?[...customDash]:patternDashes(mode,item.strokeWidth);item.dashOffset=mode==='custom'?customOffset:0;if(mode==='dotted')item.strokeCap='round';});if(mode==='dotted')cap.value='round';cap.disabled=mode==='dotted';commit();};
 return {sync,style};
}
