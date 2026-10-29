// Only the holder of this lifetime lock may write drawing recovery. Saves stay
// synchronous; transfers ask the holder to stop before the next lock is granted.
const DATA='vector-lab', NAME='vector-lab-name';
const LOCK='vector-lab-browser-recovery', REQUEST='vector-lab-recovery-request';

export function createBrowserRecovery({onState}){
  const id=Array.from(crypto.getRandomValues(new Uint32Array(4)),value=>value.toString(16)).join('-');
  let active=true, holding=false, releaseLifetime, latest, name, mode='checking', dirty=false;
  let pendingClaim, pendingAbort, requestIndex=0;

  function show(next=mode){mode=next;onState({mode,dirty});}
  function unavailable(){dirty=true;show('unavailable');}
  function paused(){
    try{
      dirty=latest!==localStorage.getItem(DATA)||name!==localStorage.getItem(NAME);
      show('paused');
    }catch{unavailable();}
  }
  function release(){
    holding=false;
    releaseLifetime?.();
    releaseLifetime=undefined;
  }
  function write(){
    try{
      localStorage.setItem(DATA,latest);
      localStorage.setItem(NAME,name);
      dirty=false;show('saved');
    }catch{unavailable();}
  }
  async function yieldToWaiting(){
    if(!holding)return;
    const currentRelease=releaseLifetime;
    try{
      const {pending}=await navigator.locks.query();
      if(holding&&releaseLifetime===currentRelease&&pending.some(lock=>lock.name===LOCK)){
        release();paused();
      }
    }catch{release();unavailable();}
  }
  function claim(takeOver=false,initialState){
    if(pendingClaim)return pendingClaim;
    pendingClaim=new Promise(resolve=>{
      try{
        if(!navigator.locks?.request||!navigator.locks?.query)throw new Error('Locks unavailable');
        pendingAbort=new AbortController();
        const options=takeOver?{signal:pendingAbort.signal}:{ifAvailable:true};
        navigator.locks.request(LOCK,options,lock=>{
          if(!active){resolve();return;}
          // A new owner reads under its lock so it cannot overwrite a save that
          // completed while this tab was opening. Paused tabs only read.
          if(initialState)({snapshot:latest,name}=initialState());
          if(!lock){paused();resolve();return;}
          holding=true;
          const lifetime=new Promise(release=>{releaseLifetime=release;});
          write();resolve();
          // Two transfers can queue together. Pass ownership to the next waiter
          // even if its request notification arrived before we acquired the lock.
          void yieldToWaiting();
          return lifetime;
        }).catch(error=>{
          if(error.name!=='AbortError')unavailable();
          resolve();
        });
        if(takeOver)localStorage.setItem(REQUEST,`${id}:${++requestIndex}`);
      }catch{
        pendingAbort?.abort();unavailable();resolve();
      }
    }).finally(()=>{pendingClaim=undefined;pendingAbort=undefined;});
    return pendingClaim;
  }
  async function start(snapshot,drawingName,initialState){
    latest=snapshot;name=drawingName;dirty=false;show('checking');
    await claim(false,initialState);
  }
  function save(snapshot,drawingName){
    latest=snapshot;name=drawingName;dirty=true;
    if(holding)write();
    else if(mode==='unavailable')unavailable();
    else paused();
  }
  window.addEventListener('storage',event=>{
    if(event.key===REQUEST)void yieldToWaiting();
    else if(!holding&&(event.key===DATA||event.key===NAME||event.key===null))paused();
  });
  window.addEventListener('focus',()=>{if(!holding&&mode==='paused')paused();});
  window.addEventListener('pagehide',()=>{active=false;pendingAbort?.abort();release();});
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    active=true;
    // Returning through Back/Forward must preserve paused work in memory, and
    // must not overwrite a newer recovery copy saved while this page was away.
    try{
      if(mode==='saved'&&latest===localStorage.getItem(DATA)&&name===localStorage.getItem(NAME))void claim();
      else paused();
    }catch{unavailable();}
  });
  window.addEventListener('beforeunload',event=>{
    if(dirty){event.preventDefault();event.returnValue='';}
  });
  return {start,save,takeOver:()=>claim(true),get mode(){return mode;}};
}
