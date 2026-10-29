// PNG tEXt stores an ASCII JSON envelope; SVG is UTF-8 encoded as base64.
// Keep the keyword and format stable; unsupported versions fall back to pixels.
const KEY='VectorLab',FORMAT='vector-lab.editable-png',VERSION=1,MAX=30e6;
const signature=[137,80,78,71,13,10,26,10];
const encoder=new TextEncoder();
function crc(bytes){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;}
function chunks(bytes){
  if(!signature.every((value,index)=>bytes[index]===value))throw Error('Not a PNG');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result=[];
  for(let start=8;start+12<=bytes.length;){const length=view.getUint32(start),end=start+12+length;if(end>bytes.length)throw Error('Incomplete PNG');const type=String.fromCharCode(...bytes.subarray(start+4,start+8));result.push({start,end,type,data:bytes.subarray(start+8,end-4),valid:crc(bytes.subarray(start+4,end-4))===view.getUint32(end-4)});start=end;if(type==='IEND')return result;}
  throw Error('Incomplete PNG');
}
export async function embedEditableSVG(png,svg){
  const source=encoder.encode(svg);if(source.length>MAX)throw Error('This drawing is too large for an editable PNG. Save an SVG instead.');
  let binary='';for(let i=0;i<source.length;i+=32768)binary+=String.fromCharCode(...source.subarray(i,i+32768));
  const data=encoder.encode(KEY+'\0'+JSON.stringify({format:FORMAT,version:VERSION,svg:btoa(binary)}));
  const chunk=new Uint8Array(data.length+12),view=new DataView(chunk.buffer);view.setUint32(0,data.length);chunk.set(encoder.encode('tEXt'),4);chunk.set(data,8);view.setUint32(chunk.length-4,crc(chunk.subarray(4,chunk.length-4)));
  const bytes=new Uint8Array(await png.arrayBuffer()),end=chunks(bytes).find(c=>c.type==='IEND').start;
  return new Blob([bytes.subarray(0,end),chunk,bytes.subarray(end)],{type:'image/png'});
}
export async function readEditableSVG(file){
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());let found=null;
    for(const chunk of chunks(bytes)){
      if(chunk.type!=='tEXt'||chunk.data.length<KEY.length+1||!encoder.encode(KEY+'\0').every((b,i)=>chunk.data[i]===b))continue;
      if(found!==null||!chunk.valid||chunk.data.length>MAX*1.4) return null;
      const saved=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(chunk.data.subarray(KEY.length+1)));
      if(saved.format!==FORMAT||saved.version!==VERSION||typeof saved.svg!=='string'||saved.svg.length>MAX*1.34)return null;
      const binary=atob(saved.svg);if(binary.length>MAX)return null;
      found=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));
    }
    return found;
  }catch{return null;}
}
