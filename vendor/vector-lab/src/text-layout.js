// Keep editable source separate from the rendered line breaks used by SVG/canvas.
export function wrapText(source,width,measure){
 if(!width)return source;
 return source.split(/\r\n|\r|\n/).map(paragraph=>{
  const lines=[];let line='';
  for(const token of paragraph.match(/\S+\s*|\s+/g)||[]){
   if(line&&measure(line+token.trimEnd())>width){lines.push(line.trimEnd());line='';}
   for(const character of token){if(line&&measure(line+character)>width){lines.push(line.trimEnd());line='';}if(line||character.trim())line+=character;}
  }
  lines.push(line.trimEnd());return lines.join('\n');
 }).join('\n');
}
export function restoreTextLayout(item){
 migrateTextFont(item);
 const layout=item.data?.textLayout;
 if(!layout||typeof layout.source!=='string'||typeof layout.rendered!=='string'||!Number.isFinite(layout.width)||layout.width<0||layout.width>100000||!Number.isFinite(layout.leading)||layout.leading<=0)return;
 item.content=layout.rendered;item.leading=layout.leading;
}

// Migrate older drawings without retaining their superseded font binaries.
export function migrateTextFont(item){
 const replacement={'Vector Lab Sans':'Arimo','Vector Lab Serif':'Tinos','Vector Lab Mono':'Cousine'}[item.fontFamily];
 if(replacement)item.fontFamily=replacement;
}
