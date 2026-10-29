// Keep the stable parser used by font validation and vector export.
import * as opentype from 'opentype.js/dist/opentype.module.js';
export function createFontLibrary(){
 const entries=new Map(),loads=new Map(),downloaded=new Set(),previewLoads=new Map(),loadedFonts=new Map();
 const db=new Promise(resolve=>{try{const request=indexedDB.open('vector-lab-fonts',1);request.onupgradeneeded=()=>request.result.createObjectStore('fonts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);request.onblocked=()=>resolve(null);}catch{resolve(null);}});
 async function cached(key){const database=await db;if(!database)return null;return new Promise(resolve=>{try{const request=database.transaction('fonts').objectStore('fonts').get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);}catch{resolve(null);}});}
 async function save(key,bytes){const database=await db;if(!database)return false;return new Promise(resolve=>{try{const transaction=database.transaction('fonts','readwrite');transaction.objectStore('fonts').put(bytes,key);transaction.oncomplete=()=>resolve(true);transaction.onerror=transaction.onabort=()=>resolve(false);}catch{resolve(false);}});}
 const ready=fetch(`${import.meta.env.BASE_URL}fonts/catalog.json`).then(response=>{if(!response.ok)throw Error('Could not load the font list.');return response.json();}).then(async catalog=>{
  for(const entry of catalog.fonts)entries.set(entry.family,entry);
  const database=await db;if(database)await new Promise(resolve=>{try{const request=database.transaction('fonts').objectStore('fonts').getAllKeys();request.onsuccess=()=>{for(const key of request.result)downloaded.add(key);resolve();};request.onerror=resolve;}catch{resolve();}});
  return [...entries.values()];
 });
 function entry(family){return entries.get(family);}
 function urlFor(value){return value.startsWith('https:')?value:`${import.meta.env.BASE_URL}${value}`;}
 function weightFor(font,bold){return bold?font.bold:font.normal;}
 async function ensure(family,bold=false,italic=false){
  await ready;const font=entry(family);if(!font)throw Error('Select imported text and choose a font in Formatting before converting to paths.');
  const weight=weightFor(font,bold),variant=italic&&font.files[weight+'i']?weight+'i':weight,key=font.files[variant],loadKey=`${family}:${bold?'bold':'normal'}:${italic?'italic':'normal'}`;
  if(!loads.has(loadKey))loads.set(loadKey,(async()=>{
   let bytes=font.bundled?null:await cached(key),stored=!!bytes;
   if(!bytes){try{const response=await fetch(urlFor(key),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();bytes=await response.arrayBuffer();}catch{throw Error(`Could not download ${family}. Check your connection and try again.`);}}
   const parsed=opentype.parse(bytes.slice(0));
   // Validate the same outline operation used by export before changing artwork.
   parsed.getPath('Abc012',0,0,32,{features:{liga:false,rlig:false}});
   const face=await new FontFace(family,bytes,{weight:bold?'700':'400',style:variant.endsWith('i')?'italic':'normal'}).load();document.fonts.add(face);
   if(!font.bundled){stored=stored||await save(key,bytes);if(stored)downloaded.add(key);}
   const result={font:parsed,stored:font.bundled||stored,weight,syntheticItalic:italic&&!variant.endsWith('i')};loadedFonts.set(loadKey,result);return result;
  })().catch(error=>{loads.delete(loadKey);throw error;}));
  return loads.get(loadKey);
 }
 async function preview(family){
  await ready;const font=entry(family);if(!font?.preview)return family;
  if(!previewLoads.has(family))previewLoads.set(family,(async()=>{const name=`Font preview ${family}`,face=await new FontFace(name,`url("${urlFor(font.preview)}")`).load();document.fonts.add(face);return name;})().catch(error=>{previewLoads.delete(family);throw error;}));
  return previewLoads.get(family);
 }
 function available(family,bold=false,italic=false){const font=entry(family);if(!font)return false;const weight=weightFor(font,bold),variant=italic&&font.files[weight+'i']?weight+'i':weight;return font.bundled||downloaded.has(font.files[variant]);}
 return {ready,entry,ensure,preview,available,loaded:(family,bold=false,italic=false)=>loadedFonts.get(`${family}:${bold?'bold':'normal'}:${italic?'italic':'normal'}`),has:family=>entries.has(family),list:()=>[...entries.values()]};
}
