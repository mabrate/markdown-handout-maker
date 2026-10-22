/* Shared, validated video syntax. Remote embeds load only on an explicit click. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HandoutVideo=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const extensions=/\.(mp4|m4v|webm|ogv|ogg|mov)$/i;
  const syntax=/^\s*\[(youtube|video):([^\]\r\n]*)\](?:\{([^}\r\n]*)\})?\s*$/i;
  function escape(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function parse(line){
    const match=syntax.exec(line);if(!match)return null;
    const provider=match[1].toLowerCase()==='youtube'?'youtube':'local',value=match[2].trim(),attrs=match[3]||'';
    const result={type:'video',provider,value,attributes:attrs};
    const options=Object.fromEntries(attrs.split(/\s+/).filter(Boolean).map(token=>token.split('=')));
    if(options.width && (!/^(?:\d+(?:\.\d+)?|\.\d+)(?:in|cm|mm|px|%)$/.test(options.width)||parseFloat(options.width)<=0))return {...result,error:'Video width needs a positive size such as 4in or 100%.'};
    result.mediaWidth=options.width||'';
    let start=options.start;
    if(provider==='youtube'){
      let id=value;
      if(!/^[\w-]{11}$/.test(id)){
        let url;try{url=new URL(value);}catch{return {...result,error:'Use a YouTube watch, share, Shorts, or embed URL.'};}
        if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return {...result,error:'Use a YouTube web URL.'};
        const host=url.hostname.toLowerCase(),parts=url.pathname.split('/').filter(Boolean);
        if(host==='youtu.be')id=parts[0];
        else if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host))id=parts[0]==='watch'?url.searchParams.get('v'):['embed','shorts','live'].includes(parts[0])?parts[1]:'';
        else return {...result,error:'Only YouTube URLs can be embedded here.'};
        if(start===undefined){const time=url.searchParams.get('start')||url.searchParams.get('t');if(time){const duration=/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(time);start=/^\d+$/.test(time)?time:duration?String((Number(duration[1])||0)*3600+(Number(duration[2])||0)*60+(Number(duration[3])||0)):undefined;}}
      }
      if(!/^[\w-]{11}$/.test(id||''))return {...result,error:'The YouTube video ID must contain 11 letters, numbers, dashes, or underscores.'};
      if(start!==undefined && (!/^\d+$/.test(start)||Number(start)>86400))return {...result,error:'Start time must be a whole number of seconds from 0 to 86400.'};
      result.start=Number(start)||0;result.id=id;result.url=`https://www.youtube.com/watch?v=${id}${result.start?'&t='+result.start:''}`;
      result.src=`https://www.youtube-nocookie.com/embed/${id}?playsinline=1${result.start?'&start='+result.start:''}`;result.label='YouTube video';
    }else{
      let decoded;try{decoded=decodeURIComponent(value);}catch{return {...result,error:'The video filename has invalid URL encoding.'};}
      if(!decoded || /^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(decoded)||/[\\\x00-\x1f?#]/.test(decoded)||!extensions.test(decoded))return {...result,error:'Use a relative MP4, M4V, WebM, OGV, OGG, or MOV filename from your open folder.'};
      result.src=value;result.label=decoded.split('/').pop();result.url='';
    }
    return result;
  }
  function reference(block){return `${block.label}\n${block.provider==='youtube'?block.url:block.value+' (play in the app)'}`;}
  function markup(block,resolve=()=>null){
    if(block.error)return `<div class="video-error" role="note">${escape(block.error)}</div>`;
    let player;
    if(block.provider==='youtube')player='<button type="button" class="youtube-load">▶ Load YouTube video</button>';
    else{const url=resolve(block.src);player=url?`<video controls playsinline preload="metadata" src="${escape(url)}" aria-label="${escape(block.label)}"></video>`:'<div class="video-unavailable">Video not found. Check the filename and open its lesson folder.</div>';}
    return `<figure class="video-block" data-video-provider="${block.provider}" data-video-source="${escape(block.value)}"${block.provider==='youtube'?` data-embed-url="${escape(block.src)}"`:''}${block.mediaWidth?` style="width:${escape(block.mediaWidth)}"`:''}><div class="video-player">${player}</div><figcaption>${block.provider==='youtube'?`<a href="${escape(block.url)}">Open on YouTube</a>`:escape(block.label)}</figcaption><div class="video-print-reference">${escape(reference(block))}</div></figure>`;
  }
  function create(block,resolve){const container=document.createElement('div');container.innerHTML=markup(block,resolve);return container.firstElementChild;}
  function activate(event){
    const button=event.target.closest('.youtube-load');if(!button)return false;
    const block=button.closest('.video-block'),url=block?.dataset.embedUrl;
    if(!/^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?playsinline=1(?:&start=\d+)?$/.test(url||''))return false;
    const frame=document.createElement('iframe');frame.src=url;frame.title='YouTube video player';frame.allow='accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
    button.replaceWith(frame);return true;
  }
  function stop(container){for(const video of container?.querySelectorAll('video')||[])video.pause();for(const frame of container?.querySelectorAll('.video-block iframe')||[])frame.src='about:blank';}
  return {parse,markup,create,activate,stop,reference,extensions};
});
