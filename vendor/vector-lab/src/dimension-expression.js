// A small arithmetic parser, deliberately separate from JavaScript evaluation.
export function dimensionExpression(value,label){
  let text=String(value).trim().replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-'),index=0,depth=0;
  if(!text||text.length>256)return NaN;
  const assignment=text.match(/^([xywh])\s*=\s*/i);
  if(assignment){if(assignment[1].toLowerCase()!==label?.toLowerCase())return NaN;text=text.slice(assignment[0].length);}
  function whitespace(){while(/\s/.test(text[index]||'!'))index++;}
  function factor(){
    if(++depth>32)throw Error();whitespace();let result;
    const next=text[index];
    if(next==='+'||next==='-'){index++;result=(next==='-'?-1:1)*factor();}
    else if(next==='('){index++;result=expression();whitespace();if(text[index++]!==')')throw Error();}
    else{const number=text.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);if(!number)throw Error();index+=number[0].length;result=Number(number[0]);}
    depth--;return result;
  }
  function term(){let result=factor();while(true){whitespace();const operator=text[index];if(operator!=='*'&&operator!=='/')return result;index++;const right=factor();result=operator==='*'?result*right:result/right;}}
  function expression(){let result=term();while(true){whitespace();const operator=text[index];if(operator!=='+'&&operator!=='-')return result;index++;const right=term();result=operator==='+'?result+right:result-right;}}
  try{const result=expression();whitespace();return index===text.length&&Number.isFinite(result)?result:NaN;}catch{return NaN;}
}
