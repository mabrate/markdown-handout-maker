// Keep the filename usable in Files and on the computers receiving the SVG.
export function svgFilename(value){
  const name=String(value||'').trim().replace(/\.svg$/i,'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/^\.+|[.\s]+$/g,'').slice(0,120);
  return `${name||'vector-lab'}.svg`;
}
export function canShareSVG(file){
  try{return !!(globalThis.isSecureContext&&navigator.share&&navigator.canShare&&navigator.canShare({files:[file]}));}
  catch{return false;}
}
