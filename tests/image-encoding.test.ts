import {describe,it,expect} from 'vitest'
import {encodeBytesBase64,decodeImageBase64,bytesToDataUrl,parseImageBase64} from '../src/lib/image-encoding/base64-bytes'
import {detectImage,mimeMatches,IMAGE_ENCODING_MAX_BYTES} from '../src/lib/image-encoding/format'
const concat=(...xs:number[][])=>new Uint8Array(xs.flat())
const le32=(n:number)=>[n&255,n>>8&255,n>>16&255,n>>24&255]
const png=()=>concat([137,80,78,71,13,10,26,10],[0,0,0,13],[73,72,68,82,0,0,0,2,0,0,0,3,8,6,0,0,0,0,0,0,0])
const jpeg=()=>concat([255,216,255,224,0,16,74,70,73,70],[1,2,255,217])
const webp=()=>concat([82,73,70,70],le32(8),[87,69,66,80,86,80,56,32])
const gif=()=>concat([71,73,70,56,57,97,2,0,3,0,128,0,0],[0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,2,0,3,0,0])
const bmp=()=>concat([66,77],le32(26),[0,0,0,0],le32(26),le32(12),[2,0,3,0,1,0,24,0])
const ico=()=>concat([0,0,1,0,1,0],[16,16,0,0,1,0,32,0],le32(4),le32(22),[1,2,3,4])
const samples=[
 {name:'png',mime:'image/png',bytes:png()},
 {name:'jpeg',mime:'image/jpeg',bytes:jpeg()},
 {name:'webp',mime:'image/webp',bytes:webp()},
 {name:'gif',mime:'image/gif',bytes:gif()},
 {name:'bmp',mime:'image/bmp',bytes:bmp()},
 {name:'ico',mime:'image/vnd.microsoft.icon',bytes:ico()}
]
describe('二进制图片 Base64 编解码',()=>{
 for(const item of samples){
  it(item.name+' 原始二进制往返严格一致',()=>{
   expect(detectImage(item.bytes).mime).toBe(item.mime)
   const text=encodeBytesBase64(item.bytes)
   const restored=decodeImageBase64(text)
   expect(Array.from(restored.bytes)).toEqual(Array.from(item.bytes))
   expect(restored.image.mime).toBe(item.mime)
   const dataUrl=bytesToDataUrl(item.bytes)
   expect(decodeImageBase64(dataUrl).bytes).toEqual(item.bytes)
  })
 }
 it('换行/空格、无填充字母表仍规范',()=>{
  const b64=encodeBytesBase64(png())
  const mixed=' \n'+b64.slice(0,8)+' \r\n\t'+b64.slice(8)+' '
  expect(decodeImageBase64(mixed).bytes).toEqual(png())
  expect(decodeImageBase64(b64.replace(/=+$/,'')).bytes).toEqual(png())
 })
 it('拒绝非法字母、非规范填充、尾位与 MIME 不一致',()=>{
  expect(()=>parseImageBase64('abcd-_')).toThrow()
  expect(()=>parseImageBase64('AQ===')).toThrow()
  expect(()=>parseImageBase64('AQB=')).toThrow('尾部')
  expect(()=>parseImageBase64('AQ==\n====')).toThrow()
  expect(()=>decodeImageBase64('data:image/jpeg;base64,'+encodeBytesBase64(png()))).toThrow('不一致')
  expect(()=>decodeImageBase64('data:text/html;base64,'+encodeBytesBase64(png()))).toThrow()
  expect(mimeMatches('image/vnd.microsoft.icon','image/x-icon')).toBe(true)
 })
 it('拒绝伪造文件头、零字节或 20 MiB/30 MiB 超限',()=>{
  expect(()=>detectImage(new Uint8Array([137,80,78,71,13,10,26,10]))).toThrow()
  expect(()=>encodeBytesBase64(new Uint8Array())).toThrow()
  expect(()=>encodeBytesBase64(new Uint8Array(IMAGE_ENCODING_MAX_BYTES+1))).toThrow()
  expect(()=>parseImageBase64('A'.repeat(30*1024*1024+1))).toThrow('30 MiB')
  expect(()=>parseImageBase64('A'.repeat(28*1024*1024))).toThrow('20 MiB')
 })
})
