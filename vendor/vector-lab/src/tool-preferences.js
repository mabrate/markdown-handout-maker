// Store only valid control values, never image-specific selections or geometry.
export function toolPreferences(key,controls){
  const defaults=Object.fromEntries(Object.entries(controls).map(([name,el])=>[name,el.type==='checkbox'?el.checked:el.value]));
  const read=()=>{try{const saved=JSON.parse(localStorage.getItem(key));return saved?.version===1&&saved.values&&typeof saved.values==='object'?saved.values:{};}catch{return {};}};
  function assign(name,value){const el=controls[name];if(el.type==='checkbox'){if(typeof value==='boolean')el.checked=value;return;}
    if(typeof value!=='string')return;
    if(el.tagName==='SELECT'){if([...el.options].some(option=>option.value===value))el.value=value;return;}
    if(!value.trim()||!Number.isFinite(Number(value))||(el.min!==''&&Number(value)<Number(el.min))||(el.max!==''&&Number(value)>Number(el.max)))return;
    const old=el.value;el.value=value;if(!el.validity.valid)el.value=old;
  }
  const saved=read();for(const name of Object.keys(controls))assign(name,saved[name]);
  function save(){const values={...defaults,...read()};for(const [name,el] of Object.entries(controls)){if(el.type==='checkbox')values[name]=el.checked;else if(el.value!==''&&el.validity.valid)values[name]=el.value;}
    try{localStorage.setItem(key,JSON.stringify({version:1,values}));}catch{}
  }
  function reset(){for(const name of Object.keys(controls))assign(name,defaults[name]);save();}
  return {save,reset,hasSaved:Object.keys(saved).length>0};
}
