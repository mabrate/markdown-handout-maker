// Render the exported artwork, rather than the editor canvas and its overlays.
export async function createPNG(svg,width,height){
  width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
  if(width>16384||height>16384||width*height>32000000)throw Error('This page is too large for PNG export. Reduce the page dimensions to at most 16,384 pixels per side and 32 million pixels total.');
  const document=new DOMParser().parseFromString(svg,'image/svg+xml');
  document.documentElement.setAttribute('width',String(width));document.documentElement.setAttribute('height',String(height));
  const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(document)],{type:'image/svg+xml'}));
  try{
    const image=new Image();image.src=url;await image.decode();
    const canvas=window.document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw Error('Could not prepare the PNG image.');
    context.drawImage(image,0,0,width,height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Could not create the PNG image.')),'image/png'));
  }finally{URL.revokeObjectURL(url);}
}
