import {decodeHTML} from 'entities'
import {decodeBase64,encodeBase64} from '../base64'
import {transformJson} from '../json/transform'
import {assertTextScalar,type CodecStep,MAX_STEP_BYTES} from '../../shared/codecModels'
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true})
const bytes=(text:string)=>enc.encode(text)
const asText=(b:Uint8Array)=>{try{return dec.decode(b)}catch{throw Error('解码结果不是合法 UTF-8 文本')}}
function hexDecode(input:string):Uint8Array{
 const s=input.trim()
 if(!s)return new Uint8Array()
 let parts:string[]
 if(s.startsWith('\\x')){if(!/^(?:\\x[0-9a-fA-F]{2})+$/.test(s))throw Error('Hex \\x 字节格式无效');parts=s.match(/[a-fA-F0-9]{2}/g)||[]}
 else if(s.startsWith('0x')){if(!/^0x[0-9a-fA-F]{2}(?:\s+0x[0-9a-fA-F]{2})*$/.test(s))throw Error('Hex 0x 字节格式无效');parts=(s.match(/0x[0-9a-fA-F]{2}/g)||[]).map(x=>x.slice(2))}
 else if(/\s/.test(s)){parts=s.split(/\s+/);if(parts.some(x=>! /^[0-9a-fA-F]{2}$/.test(x)))throw Error('Hex 空格分组必须每组两个十六进制位')}
 else {if(!/^(?:[0-9a-fA-F]{2})+$/.test(s))throw Error('Hex 字符串包含非法字符或奇数位');parts=s.match(/.{2}/g)||[]}
 return Uint8Array.from(parts,x=>parseInt(x,16))
}
function formatHex(b:Uint8Array,style:string,uppercase:boolean){
 const hex=Array.from(b,n=>n.toString(16).padStart(2,'0')).map(x=>uppercase?x.toUpperCase():x)
 if(style==='compact')return hex.join('')
 if(style==='0x')return hex.map(x=>'0x'+x).join(' ')
 if(style==='slash-x')return hex.map(x=>'\\x'+x).join('')
 return hex.join(' ')
}
function unicodeEncode(s:string,format:string):string{
 const parts:string[]=[]
 for(const c of s){
  const cp=c.codePointAt(0)!
  if(format==='codepoint'){parts.push('U+'+cp.toString(16).toUpperCase().padStart(4,'0'));continue}
  if(cp===92){parts.push('\\\\');continue}
  if(cp>=32&&cp<=126){parts.push(c);continue}
  const hex=cp.toString(16).toUpperCase()
  if(format==='es6'){parts.push('\\u{'+hex+'}');continue}
  if(cp<=0xFFFF)parts.push('\\u'+hex.padStart(4,'0'))
  else {const pair=cp-0x10000;parts.push('\\u'+(0xD800+(pair>>10)).toString(16).toUpperCase()+'\\u'+(0xDC00+(pair&1023)).toString(16).toUpperCase())}
 }
 return format==='codepoint'?parts.join(' '):parts.join('')
}
function unicodeDecode(s:string,format:string):string{
 if(format==='codepoint'){
  if(!s.trim())return ''
  return s.trim().split(/\s+/).map(x=>{if(!/^U\+[0-9a-fA-F]{4,6}$/.test(x))throw Error('Unicode 码点必须写作 U+XXXX')
   const cp=parseInt(x.slice(2),16);if(cp>0x10FFFF||(cp>=0xD800&&cp<=0xDFFF))throw Error('Unicode 码点超出有效范围');return String.fromCodePoint(cp)}).join('')
 }
 let out=''
 for(let i=0;i<s.length;){
  if(s[i]!=='\\'){out+=s[i++];continue}
  if(s[i+1]==='\\'){out+='\\';i+=2;continue}
  if(format==='es6'){
   const m=/^\\u\{([0-9a-fA-F]{1,6})\}/.exec(s.slice(i));if(!m)throw Error('Unicode ES6 转义无效')
   const cp=parseInt(m[1],16);if(cp>0x10FFFF||(cp>=0xD800&&cp<=0xDFFF))throw Error('Unicode 标量值无效')
   out+=String.fromCodePoint(cp);i+=m[0].length;continue
  }
  const match=/^\\u([0-9a-fA-F]{4})/.exec(s.slice(i));if(!match)throw Error('Unicode \\uXXXX 转义无效')
  const n=parseInt(match[1],16);i+=6
  if(n>=0xD800&&n<=0xDBFF){const lo=/^\\u([0-9a-fA-F]{4})/.exec(s.slice(i));if(!lo)throw Error('Unicode 高代理项缺少低代理项')
   const l=parseInt(lo[1],16);if(l<0xDC00||l>0xDFFF)throw Error('Unicode 代理项配对错误')
   out+=String.fromCharCode(n,l);i+=6
  }else if(n>=0xDC00&&n<=0xDFFF)throw Error('Unicode 孤立的低代理项')
  else out+=String.fromCharCode(n)
 }
 assertTextScalar(out);return out
}
function htmlEncode(s:string,format:string){
 const basic:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}
 let out=''
 for(const c of s){const cp=c.codePointAt(0)!
  if(format==='basic')out+=basic[c]||c
  else if(cp>=128||basic[c])out+=format==='hex'?'&#x'+cp.toString(16).toUpperCase()+';':'&#'+cp+';'
  else out+=c
 }
 return out
}
function htmlDecode(s:string){
 for(const match of s.matchAll(/&#(?:x([0-9a-fA-F]+)|([0-9]+));?/g)){
  const cp=parseInt(match[1]||match[2],match[1]?16:10)
  if(!Number.isFinite(cp)||cp===0||cp>0x10FFFF||(cp>=0xD800&&cp<=0xDFFF))throw Error('HTML 数字实体不是有效 Unicode 标量')
 }
 return decodeHTML(s)
}
function binaryDecode(s:string){
 const raw=s.trim();if(!raw)return ''
 const list= /\s/.test(raw)?raw.split(/\s+/):raw.match(/.{1,8}/g)||[]
 if(list.some(x=>! /^[01]{8}$/.test(x)))throw Error('Binary 每组必须为完整 8 bit 二进制')
 return asText(Uint8Array.from(list,x=>parseInt(x,2)))
}
export function convertText(input:string,step:CodecStep):string{
 assertTextScalar(input)
 const o=step.options,encode=step.direction==='encode'
 let result=''
 switch(step.kind){
  case 'base64':result=encode?encodeBase64(input,o.variant==='url'?'url':'standard',o.padded!==false,MAX_STEP_BYTES):decodeBase64(input,o.variant||'auto',MAX_STEP_BYTES);break
  case 'url':{
   const mode=o.mode||'component'
   try {result=encode?(mode==='uri'?encodeURI(input):mode==='form'?encodeURIComponent(input).replace(/%20/g,'+'):encodeURIComponent(input))
    :(mode==='uri'?decodeURI(input):decodeURIComponent(mode==='form'?input.replace(/\+/g,' '):input))}
   catch{throw Error('URL 百分号转义或 UTF-8 编码无效')}
   break
  }
  case 'unicode':result=encode?unicodeEncode(input,o.format||'js'):unicodeDecode(input,o.format||'js');break
  case 'hex':result=encode?formatHex(bytes(input),o.format||'space',o.uppercase!==false):asText(hexDecode(input));break
  case 'html-entity':result=encode?htmlEncode(input,o.format||'basic'):htmlDecode(input);break
  case 'json-escape':result=transformJson(input,encode?'escape':'unescape');break
  case 'binary':result=encode?Array.from(bytes(input),b=>b.toString(2).padStart(8,'0')).join(o.format==='compact'?'':' '):binaryDecode(input);break
 }
 if(bytes(result).length>MAX_STEP_BYTES)throw Error('步骤输出超过 8 MiB 上限')
 return result
}
