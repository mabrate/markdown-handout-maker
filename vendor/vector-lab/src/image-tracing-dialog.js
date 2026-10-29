import {toolPreferences} from './tool-preferences.js';
import {TRACE_PRESETS,tracePathData} from './image-tracing.js';
import {createTraceRefinement} from './trace-refinement.js';

export function installImageTracing({getImage,apply,say}){
  const dialog=document.createElement('dialog');dialog.id='trace-dialog';dialog.setAttribute('aria-labelledby','trace-title');
  dialog.innerHTML=`<div class="trace-heading"><div><h2 id="trace-title">Trace image to paths</h2><span>Editable shapes for making and designing</span></div><button id="trace-close" aria-label="Close image tracing">×</button></div>
  <p>Choose Solid silhouette or Cutout outline for a whole subject, Black and white for dark details, Colors for illustrations, or Pixel art for a square-pixel version.</p>
  <div class="trace-controls">
    <label>Trace mode<select id="trace-mode"><option value="mono">Black and white</option><option value="silhouette">Solid silhouette</option><option value="outline">Cutout outline</option><option value="color">Colors</option><option value="pixel">Pixel art</option></select></label>
    <label id="trace-pixel-sizing-control" hidden>Pixel sizing<select id="trace-pixel-sizing"><option value="detail">Pixels on longest side</option><option value="block">Consistent block size</option></select></label>
    <label id="trace-block-control" hidden>Block size (px)<input id="trace-block" type="number" min="1" max="256" step="1" value="4"></label>
    <label id="trace-pixel-control" hidden>Pixels on longest side<select id="trace-pixel"><option>16</option><option>24</option><option selected>32</option><option>48</option><option>64</option><option>128</option></select></label>
    <label id="trace-preset-control">Detail / complexity<select id="trace-preset"><option value="simple">Simple · 1,000</option><option value="balanced">Balanced · 2,000</option><option value="detailed">Detailed · 5,000</option></select></label>
    <label id="trace-threshold-control">Darkness threshold<div class="trace-range"><input id="trace-threshold" type="range" min="0" max="255" value="128"><output id="trace-threshold-value">50%</output></div></label>
    <label id="trace-colors-control" hidden>Maximum colors<select id="trace-colors"><option value="2">2 colors</option><option value="4" selected>4 colors</option><option value="8">8 colors</option><option value="12">12 colors</option><option value="16">16 colors</option></select></label>
    <label id="trace-background-control" hidden>Background tolerance<div class="trace-range"><input id="trace-background" type="range" min="0" max="100" value="20"><output id="trace-background-value">20%</output></div></label>
    <label id="trace-outline-control" hidden>Outline width<div class="trace-range"><input id="trace-outline" type="range" min="0.5" max="5" step="0.25" value="1.5"><output id="trace-outline-value">1.5%</output></div></label>
    <label id="trace-smoothing-control" title="Low values preserve pixel detail. High values remove small bumps and fit broader curves while protecting corners.">Edge smoothing<div class="trace-range"><input id="trace-smoothing" type="range" min="0" max="100" value="70"><output id="trace-smoothing-value">70%</output></div></label>
    <label id="trace-noise-control">Remove small specks<div class="trace-range"><input id="trace-noise" type="range" min="0" max="100" value="12"><output id="trace-noise-value">12</output></div></label>
  </div>
  <div class="trace-options"><label id="trace-invert-control"><input id="trace-invert" type="checkbox"> Trace light areas instead</label><label id="trace-white-control" hidden><input id="trace-white" type="checkbox" checked> Leave white empty</label><label id="trace-holes-control"><input id="trace-holes" type="checkbox"> Fill enclosed holes</label><label id="trace-stack-control" hidden title="Overlap color layers to prevent pale seams. Turn off for separate color regions."><input id="trace-stack" type="checkbox" checked> Stack colors to hide seams</label><button id="trace-use-silhouette" hidden>Try solid silhouette</button><button id="trace-reset">Reset defaults</button></div>
  <fieldset class="trace-refinement"><legend>Touch up the trace</legend><div class="trace-refinement-controls"><label>Tool <select id="trace-brush-mode"><option value="view">View only</option><option value="include">Include brush</option><option value="exclude">Exclude brush</option><option value="spot">Remove spot</option><option value="erase">Erase marks</option></select></label><label>Brush size <input id="trace-brush-size" type="range" min="2" max="100" value="20"><output id="trace-brush-size-value">20 px</output></label><button id="trace-edit-undo" disabled>Undo edit</button><button id="trace-edit-clear" disabled>Clear marks</button></div><small>Paint on either preview. Green includes missing parts; pink excludes shadows. Remove spot deletes a connected traced shape. Use a brush for shadows attached to the subject.</small></fieldset>
  <div class="trace-zoom"><span>Preview zoom</span><button id="trace-zoom-out" aria-label="Zoom trace out">−</button><output id="trace-zoom-value">100%</output><button id="trace-zoom-in" aria-label="Zoom trace in">+</button><button id="trace-zoom-fit">Fit</button><small>Drag to pan with View only. Scroll over a preview to zoom.</small></div>
  <div class="trace-previews"><figure><figcaption>Visible image</figcaption><div class="trace-preview"><canvas id="trace-original" tabindex="0" aria-label="Original image preview"></canvas></div></figure><figure><figcaption>Vector paths</figcaption><div class="trace-preview" id="trace-result" tabindex="0" role="img" aria-label="Traced path preview"></div></figure></div>
  <p id="trace-status" role="status" aria-live="polite"></p><small id="trace-help">Simple uses our conservative limits of 1,000 nodes and 120 outlines. Closed paths include real holes, with no background rectangle or outline stroke. Use Simple for Tinkercad and cutting, and color for artwork.</small>
  <div class="trace-footer"><span>Replaces the image. Undo restores it.</span><button id="trace-cancel">Cancel</button><button id="trace-apply" class="primary" disabled>Convert to paths</button></div>`;
  document.body.append(dialog);
  const el=name=>dialog.querySelector(`#trace-${name}`),originalCanvas=el('original');
  const preferences=toolPreferences('vector-lab-trace-settings',Object.fromEntries(['mode','pixel','pixel-sizing','block','preset','colors','threshold','noise','invert','white','holes','smoothing','background','outline','stack','brush-mode','brush-size'].map(name=>[name,el(name)])));
  dialog.addEventListener('input',event=>{if(event.target.matches('input,select'))preferences.save();});
  let session=null,result=null,worker=null,timer=null,revision=0,refinement=null,stroke=null,editHistory=[],presetChosen=false;
  let zoom=1,center={x:.5,y:.5},pan=null;
  const previews=[originalCanvas.parentElement,el('result')];
  function previewSize(viewport){
    const fit=Math.min(viewport.clientWidth/session.image.width,viewport.clientHeight/session.image.height);
    return {width:session.image.width*fit*zoom,height:session.image.height*fit*zoom};
  }
  function updateZoom(){
    if(!session||!dialog.open)return;
    for(const viewport of previews){
      const image=viewport.querySelector('canvas,svg');if(!image)continue;
      const size=previewSize(viewport);
      Object.assign(image.style,{width:size.width+'px',height:size.height+'px',left:(viewport.clientWidth/2+(.5-center.x)*size.width)+'px',top:(viewport.clientHeight/2+(.5-center.y)*size.height)+'px'});
    }
    el('zoom-value').textContent=Math.round(zoom*100)+'%';el('zoom-out').disabled=zoom<=1;el('zoom-in').disabled=zoom>=8;
  }
  function setZoom(next,viewport,point){
    if(stroke)return;
    const previous=zoom;next=Math.max(1,Math.min(8,next));
    if(viewport&&point){const bounds=viewport.getBoundingClientRect(),size=previewSize(viewport),dx=point.x-bounds.left-viewport.clientWidth/2,dy=point.y-bounds.top-viewport.clientHeight/2;center.x+=dx/size.width*(1-previous/next);center.y+=dy/size.height*(1-previous/next);}
    zoom=next;if(zoom===1)center={x:.5,y:.5};
    center.x=Math.max(0,Math.min(1,center.x));center.y=Math.max(0,Math.min(1,center.y));updateZoom();
  }
  el('zoom-in').onclick=()=>setZoom(zoom*1.5);el('zoom-out').onclick=()=>setZoom(zoom/1.5);el('zoom-fit').onclick=()=>setZoom(1);
  for(const viewport of previews){
    viewport.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*Math.exp(-e.deltaY*.002),viewport,{x:e.clientX,y:e.clientY});},{passive:false});
    viewport.addEventListener('pointerdown',e=>{
      if(!session||stroke||pan||e.button!==0||el('brush-mode').value!=='view'||zoom<=1)return;
      e.preventDefault();viewport.setPointerCapture(e.pointerId);pan={id:e.pointerId,x:e.clientX,y:e.clientY,center:{...center},size:previewSize(viewport)};viewport.classList.add('trace-panning');
    });
    viewport.addEventListener('pointermove',e=>{if(pan?.id!==e.pointerId)return;center={x:Math.max(0,Math.min(1,pan.center.x-(e.clientX-pan.x)/pan.size.width)),y:Math.max(0,Math.min(1,pan.center.y-(e.clientY-pan.y)/pan.size.height))};updateZoom();});
    const end=e=>{if(pan?.id===e.pointerId){pan=null;viewport.classList.remove('trace-panning');}};
    viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
  }
  new ResizeObserver(updateZoom).observe(previews[0]);
  function stop(){clearTimeout(timer);timer=null;worker?.terminate();worker=null;}
  function settings(){return {pixelSizing:el('pixel-sizing').value,blockSize:Number(el('block').value),artworkWidth:session.artworkWidth,artworkHeight:session.artworkHeight,pixelSize:Number(el('pixel').value),mode:el('mode').value,preset:el('preset').value,colors:Number(el('colors').value),threshold:Number(el('threshold').value),noise:Number(el('noise').value),invert:el('invert').checked,ignoreWhite:el('white').checked,fillHoles:el('holes').checked,smoothing:Number(el('smoothing').value),backgroundTolerance:Number(el('background').value),outlineWidth:Number(el('outline').value),stackColors:el('stack').checked};}
  function controls(){
    const mode=el('mode').value,pixel=mode==='pixel',color=mode==='color'||pixel,subject=mode==='silhouette'||mode==='outline',preset=TRACE_PRESETS[el('preset').value];
    el('pixel-sizing-control').hidden=!pixel;el('block-control').hidden=!pixel||el('pixel-sizing').value!=='block';el('pixel-control').hidden=!pixel||el('pixel-sizing').value==='block';for(const name of ['preset-control','smoothing-control','noise-control'])el(name).hidden=pixel;
    for(const name of ['colors-control','white-control'])el(name).hidden=!color;
    for(const name of ['threshold-control','invert-control'])el(name).hidden=mode!=='mono';el('stack-control').hidden=mode!=='color';el('holes-control').hidden=color;el('background-control').hidden=!subject;el('outline-control').hidden=mode!=='outline';el('background-value').textContent=el('background').value+'%';el('outline-value').textContent=el('outline').value+'%';
    el('threshold-value').textContent=Math.round(Number(el('threshold').value)/255*100)+'%';el('noise-value').textContent=el('noise').value;el('smoothing-value').textContent=el('smoothing').value+'%';
    el('help').textContent=pixel?'Set images to their intended game size before tracing. Use the same block size for matching pixels across assets. Resizing afterward also resizes the blocks. Transparent margins are skipped. Each grid cell becomes a crisp, editable rectangle. Fewer pixels and colors give a chunkier look without changing the artwork’s size. White can be left empty; transparent areas stay empty.':`${preset.label} uses our limits of ${preset.maxNodes.toLocaleString()} nodes and ${preset.maxContours} outlines. Closed paths include real holes, with no background rectangle or outline stroke. ${color?'Stacked colors hide seams; turn stacking off for separate regions. Balanced or Detailed retains more small color details.':subject?'Transparent images use their visible shape. For opaque images, the background must be plain. Use Include/Exclude to correct the subject.':'Black and white selects dark pixels. Try Solid silhouette if a light-colored subject is incomplete.'}`;
  }
  function renderTrace(value){
    el('result').replaceChildren();
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${value.width} ${value.height}`);svg.setAttribute('width',String(value.width));svg.setAttribute('height',String(value.height));
    for(const shape of value.shapes){const path=document.createElementNS(ns,'path');path.setAttribute('d',tracePathData(shape.contours,shape.segments));path.setAttribute('fill',shape.fill);path.setAttribute('fill-rule','nonzero');svg.append(path);}
    el('result').append(svg);updateZoom();el('result').setAttribute('aria-busy','false');
    const summary=value.pixelArt?`${value.gridWidth??value.width} × ${value.gridHeight??value.height} pixels · ${value.shapes.length} colors`:`${value.nodes.toLocaleString()} nodes · ${value.contourCount.toLocaleString()} outlines · ${value.shapes.length} color${value.shapes.length===1?'':'s'}`;
    el('status').classList.toggle('trace-error',value.tooComplex);
    el('status').textContent=value.tooComplex?`${summary}. Too complex for this limit. Increase speck removal, use fewer colors, or choose a higher limit.`:!value.shapes.length?'Nothing to trace. Adjust the threshold, switch light/dark, or reduce speck removal.':`${summary}${value.removed?` · ${value.removed} small details removed`:''}${value.holesFilled?` · ${value.holesFilled} enclosed holes filled`:''}${value.correctedPixels?' · Manual corrections applied':''}${value.adjusted?' · Simplified further to fit the node limit':''}.`;
    el('use-silhouette').hidden=!value.recommendSilhouette;
    if(value.subjectMethod==='uncertain'&&['silhouette','outline'].includes(el('mode').value))el('status').textContent+=' No plain background found. Use Remove background first, or mark the subject with Include/Exclude.';
    el('apply').disabled=!!stroke||value.tooComplex||!value.shapes.length;
  }
  function renderMarks(){
    if(!session||!refinement)return;
    const pixels=new ImageData(new Uint8ClampedArray(session.image.data),session.image.width,session.image.height);
    for(let i=0;i<refinement.mask.length;i++){const value=refinement.mask[i];if(!value)continue;const p=i*4,color=value===1?[38,170,90]:[237,40,110];
      for(let c=0;c<3;c++)pixels.data[p+c]=Math.round(pixels.data[p+c]*.45+color[c]*.55);
      pixels.data[p+3]=Math.max(180,pixels.data[p+3]);
    }
    originalCanvas.getContext('2d').putImageData(pixels,0,0);el('edit-undo').disabled=!!stroke||!editHistory.length;el('edit-clear').disabled=!!stroke||!refinement.mask.some(Boolean);
  }
  function updateBrush(){
    const mode=el('brush-mode').value,size=Number(el('brush-size').value);el('brush-size-value').textContent=size+' px';el('brush-size').disabled=mode==='view'||mode==='spot';
    let cursor=mode==='view'?'default':'crosshair';
    if(mode!=='view'&&mode!=='spot'){
      const width=size+4,center=width/2,color=mode==='include'?'#26aa5a':mode==='exclude'?'#ed286e':'#267d81',svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><circle cx="${center}" cy="${center}" r="${size/2}" fill="none" stroke="white" stroke-width="3"/><circle cx="${center}" cy="${center}" r="${size/2}" fill="none" stroke="${color}"/></svg>`;
      cursor=`url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;
    }
    originalCanvas.style.cursor=el('result').style.cursor=cursor;
  }
  function rememberEdit(){editHistory.push(refinement.mask.slice());if(editHistory.length>12)editHistory.shift();}
  function previewBounds(surface){return surface===originalCanvas?originalCanvas.getBoundingClientRect():el('result').querySelector('svg')?.getBoundingClientRect();}
  function brushPoint(e,bounds){return {x:Math.max(0,Math.min(session.image.width-1,(e.clientX-bounds.left)*session.image.width/bounds.width)),y:Math.max(0,Math.min(session.image.height-1,(e.clientY-bounds.top)*session.image.height/bounds.height))};}
  function paint(p){
    const previous=stroke.last||p,steps=Math.max(1,Math.ceil(Math.hypot(p.x-previous.x,p.y-previous.y)/Math.max(1,stroke.radius/2)));
    for(let i=1;i<=steps;i++)refinement.brush(previous.x+(p.x-previous.x)*i/steps,previous.y+(p.y-previous.y)*i/steps,stroke.radius,stroke.value);
    stroke.last=p;renderMarks();
  }
  for(const surface of [originalCanvas,el('result')]){
    surface.addEventListener('pointerdown',e=>{
      const mode=el('brush-mode').value;if(!session||stroke||e.button!==0||mode==='view')return;
      const bounds=previewBounds(surface);if(!bounds||e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)return;
      e.preventDefault();surface.focus({preventScroll:true});const p=brushPoint(e,bounds);
      if(mode==='spot'){
        if(!result){el('status').textContent='Wait for the trace preview before removing a spot.';return;}
        rememberEdit();if(!refinement.removeSpot(p.x,p.y,result.selection,result.width,result.height)){editHistory.pop();el('status').textContent='Click a traced shape to remove that connected spot.';return;}
        renderMarks();schedule();return;
      }
      stop();++revision;el('apply').disabled=true;rememberEdit();surface.setPointerCapture(e.pointerId);
      stroke={id:e.pointerId,bounds,radius:Number(el('brush-size').value)*session.image.width/bounds.width/2,value:mode==='include'?1:mode==='exclude'?2:0};paint(p);
    });
    surface.addEventListener('pointermove',e=>{if(stroke?.id===e.pointerId)paint(brushPoint(e,stroke.bounds));});
    function endStroke(e){if(stroke?.id!==e.pointerId)return;if(e.type==='pointercancel')refinement.mask.set(editHistory.pop());else paint(brushPoint(e,stroke.bounds));stroke=null;renderMarks();schedule();}
    surface.addEventListener('pointerup',endStroke);surface.addEventListener('pointercancel',endStroke);
  }
  el('brush-mode').onchange=updateBrush;el('brush-size').oninput=updateBrush;
  function undoEdit(){if(stroke||!editHistory.length)return;refinement.mask.set(editHistory.pop());renderMarks();schedule();}
  el('edit-undo').onclick=undoEdit;el('edit-clear').onclick=()=>{if(stroke)return;rememberEdit();refinement.mask.fill(0);renderMarks();schedule();};
  dialog.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey&&!e.target.matches('input,select')){e.preventDefault();undoEdit();}});
  function schedule(){
    if(!session)return;stop();const current=++revision;result=null;controls();el('use-silhouette').hidden=true;el('apply').disabled=true;el('result').replaceChildren();el('result').setAttribute('aria-busy','true');el('status').classList.remove('trace-error');el('status').textContent='Tracing image…';
    timer=setTimeout(()=>{
      if(!session||!dialog.open||current!==revision)return;
      try{
        const options=settings(),limit=options.mode==='pixel'?768:TRACE_PRESETS[options.preset].resolution,scale=Math.min(1,limit/Math.max(originalCanvas.width,originalCanvas.height)),sample=document.createElement('canvas');
        sample.width=Math.max(1,Math.round(originalCanvas.width*scale));sample.height=Math.max(1,Math.round(originalCanvas.height*scale));const context=sample.getContext('2d');const source=document.createElement('canvas');source.width=session.image.width;source.height=session.image.height;source.getContext('2d').putImageData(session.image,0,0);context.drawImage(source,0,0,sample.width,sample.height);const pixels=context.getImageData(0,0,sample.width,sample.height),overrides=refinement.sample(sample.width,sample.height);
        worker=new Worker(new URL('./image-tracing.worker.js',import.meta.url),{type:'module'});
        const fail=message=>{if(current!==revision||!dialog.open)return;worker?.terminate();worker=null;el('result').setAttribute('aria-busy','false');el('status').classList.add('trace-error');el('status').textContent=message;};
        worker.onerror=()=>fail('Could not trace this image. Try resetting the settings.');
        worker.onmessage=({data})=>{if(current!==revision||!dialog.open)return;worker?.terminate();worker=null;if(data.error){fail(data.error);return;}result=data.result;renderTrace(result);};
        worker.postMessage({image:{data:pixels.data,width:pixels.width,height:pixels.height,overrides},settings:options},[pixels.data.buffer,overrides.buffer]);
      }catch{el('result').setAttribute('aria-busy','false');el('status').classList.add('trace-error');el('status').textContent='Could not prepare the image for tracing. Try inserting a local image.';}
    },150);
  }
  el('preset').addEventListener('input',()=>presetChosen=true);
  el('mode').addEventListener('input',()=>{if(!presetChosen)el('preset').value=el('mode').value==='color'?'balanced':'simple';});
  for(const name of ['mode','pixel','pixel-sizing','block','preset','colors','threshold','noise','invert','white','holes','smoothing','background','outline','stack'])el(name).addEventListener('input',schedule);
  el('use-silhouette').onclick=()=>{el('mode').value='silhouette';preferences.save();schedule();};
  el('reset').onclick=()=>{if(stroke)return;preferences.reset();presetChosen=false;updateBrush();schedule();};
  for(const name of ['close','cancel'])el(name).onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{++revision;stop();session=result=refinement=stroke=null;editHistory=[];pan=null;originalCanvas.width=originalCanvas.height=1;el('result').replaceChildren();});
  el('apply').onclick=()=>{
    if(stroke||!session||!result||result.tooComplex||!result.shapes.length)return;
    try{apply(session,result);dialog.close();}catch(error){el('status').textContent=error.message||'Could not create paths. Try again.';el('status').classList.add('trace-error');}
  };
  return function open(){
    try{
      session=getImage();if(!session)return;
      originalCanvas.width=session.image.width;originalCanvas.height=session.image.height;refinement=createTraceRefinement(session.image.width,session.image.height);
      zoom=1;center={x:.5,y:.5};presetChosen=presetChosen||preferences.hasSaved||el('preset').value!=='simple';editHistory=[];renderMarks();updateBrush();dialog.showModal();updateZoom();schedule();
    }catch(error){session=null;say(error.message||'Could not read this image for tracing.');}
  };
}
