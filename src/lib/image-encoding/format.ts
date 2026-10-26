export type ImageEncodingFormat='png'|'jpeg'|'webp'|'gif'|'bmp'|'ico'
export interface DetectedImage {format:ImageEncodingFormat;mime:string;extension:string;width?:number;height?:number}
export const IMAGE_ENCODING_MAX_BYTES=20*1024*1024
export const IMAGE_ENCODING_MAX_TEXT=30*1024*1024
const read32be=(b:Uint8Array,o:number)=>((b[o]*0x1000000)+(b[o+1]<<16)+(b[o+2]<<8)+b[o+3])>>>0
const read32le=(b:Uint8Array,o:number)=>(b[o]+b[o+1]*256+b[o+2]*65536+b[o+3]*16777216)>>>0
const read16le=(b:Uint8Array,o:number)=>b[o]+b[o+1]*256
const ascii=(b:Uint8Array,o:number,n:number)=>String.fromCharCode(...b.subarray(o,o+n))
export function detectImage(bytes:Uint8Array):DetectedImage {
 const n=bytes.length,b=bytes
 if(n>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x)
   &&ascii(b,12,4)==='IHDR'&&read32be(b,8)===13){
  const width=read32be(b,16),height=read32be(b,20)
  if(!width||!height)throw Error('PNG 图像尺寸无效')
  return {format:'png',mime:'image/png',extension:'png',width,height}
 }
 if(n>=4&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff&&b[3]!==0x00)
  return {format:'jpeg',mime:'image/jpeg',extension:'jpg'}
 if(n>=16&&ascii(b,0,4)==='RIFF'&&ascii(b,8,4)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(ascii(b,12,4))&&read32le(b,4)<=n-8)
  return {format:'webp',mime:'image/webp',extension:'webp'}
 if(n>=13&&['GIF87a','GIF89a'].includes(ascii(b,0,6))){
  const width=read16le(b,6),height=read16le(b,8)
  if(!width||!height)throw Error('GIF 尺寸无效')
  return {format:'gif',mime:'image/gif',extension:'gif',width,height}
 }
 if(n>=26&&ascii(b,0,2)==='BM'&&read32le(b,2)<=n&&read32le(b,14)>=12)
  return {format:'bmp',mime:'image/bmp',extension:'bmp'}
 if(n>=22&&b[0]===0&&b[1]===0&&b[2]===1&&b[3]===0&&read16le(b,4)>0&&read16le(b,4)<=256&&n>=6+16*read16le(b,4))
  return {format:'ico',mime:'image/vnd.microsoft.icon',extension:'ico'}
 throw Error('不是受支持的 PNG、JPEG、WebP、GIF、BMP 或 ICO 图片')
}
export function mimeMatches(actual:string,declared?:string):boolean{
 if(!declared)return true
 const m=declared.toLowerCase()
 if(actual==='image/vnd.microsoft.icon')return m==='image/vnd.microsoft.icon'||m==='image/x-icon'||m==='image/ico'
 return actual===m
}
