import {detectImage,mimeMatches,IMAGE_ENCODING_MAX_BYTES,IMAGE_ENCODING_MAX_TEXT,type DetectedImage} from './format'
const chunkSize=3*8192
const digits='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
export function encodeBytesBase64(bytes:Uint8Array):string {
 if(!bytes.length||bytes.byteLength>IMAGE_ENCODING_MAX_BYTES)throw Error('图片大小必须为 1 字节至 20 MiB')
 const result:string[]=[]
 for(let i=0;i<bytes.length;i+=chunkSize){
  const piece=bytes.subarray(i,i+chunkSize)
  let binary=''
  for(let j=0;j<piece.length;j+=8192)binary+=String.fromCharCode(...piece.subarray(j,j+8192))
  result.push(btoa(binary))
 }
 return result.join('')
}
export function parseImageBase64(value:string):{base64:string;mime?:string}{
 if(value.length>IMAGE_ENCODING_MAX_TEXT)throw Error('编码文本超过 30 MiB 限制')
 let raw=value.trim(),mime:string|undefined
 if(/^data:/i.test(raw)){
  const match=/^data:([^;,]+);base64,/i.exec(raw)
  if(!match)throw Error('图片 Data URL 必须是 data:image/…;base64, 格式')
  mime=match[1].toLowerCase()
  if(!/^image\/[a-z0-9.+-]+$/.test(mime))throw Error('Data URL 的 MIME 必须是图片类型')
  raw=raw.slice(match[0].length)
 }
 const base64=raw.replace(/[ \t\n\r]/g,'')
 if(!base64)throw Error('Base64 内容不能为空')
 if(base64.length>IMAGE_ENCODING_MAX_TEXT)throw Error('Base64 文本超出 30 MiB 限制')
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('Base64 包含非法字符或填充')
 const noPad=base64.replace(/=+$/,'')
 const mod=noPad.length%4,pad=base64.length-noPad.length
 if(mod===1||pad&&(base64.length%4!==0||pad!==(4-mod)%4))throw Error('Base64 长度或填充不合法')
 const finalDigit=digits.indexOf(noPad[noPad.length-1])
 if((mod===2&&(finalDigit&15)!==0)||(mod===3&&(finalDigit&3)!==0))
  throw Error('Base64 尾部存在非规范数据位')
 const estimated=Math.floor(noPad.length*3/4)
 if(estimated>IMAGE_ENCODING_MAX_BYTES)throw Error('解码图片超过 20 MiB 限制')
 return {base64,mime}
}
export function decodeImageBase64(value:string):{bytes:Uint8Array;image:DetectedImage}{
 const {base64,mime}=parseImageBase64(value)
 const stripped=base64.replace(/=+$/,'')
 const length=Math.floor(stripped.length*3/4)
 const bytes=new Uint8Array(length)
 const batch=4*8192
 let offset=0
 for(let i=0;i<stripped.length;i+=batch){
  const part=stripped.slice(i,i+batch)
  let binary:string
  try{binary=atob(part+'='.repeat((4-part.length%4)%4))}catch{throw Error('Base64 解码失败')}
  for(let j=0;j<binary.length;j++)bytes[offset++]=binary.charCodeAt(j)
 }
 if(bytes.byteLength>IMAGE_ENCODING_MAX_BYTES)throw Error('解码图片超过 20 MiB 限制')
 const image=detectImage(bytes)
 if(!mimeMatches(image.mime,mime))throw Error('Data URL 声明的图片格式与实际内容不一致')
 return {bytes,image}
}
export function bytesToDataUrl(bytes:Uint8Array):string{
 const info=detectImage(bytes)
 return 'data:'+info.mime+';base64,'+encodeBytesBase64(bytes)
}
