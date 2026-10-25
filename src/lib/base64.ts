export type Base64Variant = 'standard'|'url'|'auto'
const MAX_BYTES=2*1024*1024
const enc=new TextEncoder()
const dec=new TextDecoder('utf-8',{fatal:true})

export function encodeBase64(value:string,variant:Exclude<Base64Variant,'auto'>='standard',padded=variant==='standard'):string {
 const bytes=enc.encode(value)
 if(bytes.length>MAX_BYTES)throw Error('输入超过 2 MiB 的 Base64 文本处理上限')
 let binary=''
 for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192))
 const result=btoa(binary)
 const value64=variant==='url'?result.replace(/\+/g,'-').replace(/\//g,'_'):result
 return padded?value64:value64.replace(/=+$/,'')
}
export function decodeBase64(value:string,variant:Base64Variant='auto'):string {
 const clean=value.trim().replace(/\r|\n/g,'')
 if(clean.length>MAX_BYTES*4)throw Error('编码内容超过处理上限')
 if(!clean)return ''
 const standard=/[+/]/.test(clean),safe=/[-_]/.test(clean)
 if(standard&&safe)throw Error('不能混合标准 Base64 与 URL Safe 字母表')
 const resolved=variant==='auto'?(safe?'url':'standard'):variant
 if(resolved==='standard'&&safe)throw Error('标准 Base64 不允许 - 或 _')
 if(resolved==='url'&&standard)throw Error('URL Safe 不允许 + 或 /')
 const alphabet=resolved==='url'?/^[A-Za-z0-9_-]+={0,2}$/:/^[A-Za-z0-9+/]+={0,2}$/
 if(!alphabet.test(clean))throw Error('Base64 包含非法字符或填充')
 const noPad=clean.replace(/=+$/,'')
 const padding=clean.length-noPad.length
 if(noPad.length%4===1)throw Error('Base64 长度不合法')
 if(padding&&((clean.length%4)!==0 || padding!==(4-noPad.length%4)%4))throw Error('Base64 填充格式不合法')
 const normalized=noPad.replace(/-/g,'+').replace(/_/g,'/')
 const padLength=(4-normalized.length%4)%4
 let binary:string
 try { binary=atob(normalized+'='.repeat(padLength)) } catch { throw Error('Base64 内容无效') }
 // 严格验证末位 unused bits，避免 atob 的宽松容错。
 if(btoa(binary).replace(/=+$/,'')!==normalized)throw Error('Base64 存在非规范尾部位')
 if(binary.length>MAX_BYTES)throw Error('解码结果超过 2 MiB')
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))
 try {return dec.decode(bytes)}catch{throw Error('Base64 解码结果不是有效的 UTF-8 文本')}
}
