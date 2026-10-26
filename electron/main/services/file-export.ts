import {dialog,type BrowserWindow} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'

const ALLOWED=['zip','png','jpg','webp','gif','bmp','ico','txt','svg'] as const
type Format=(typeof ALLOWED)[number]
type Session={fd:number;temp:string;target:string;length:number}
const sessions=new Map<string,Session>()
const suffixes:{[K in Format]:string}={zip:'ZIP 归档',png:'PNG 图片',jpg:'JPEG 图片',webp:'WebP 图片',gif:'GIF 图片',bmp:'BMP 图片',ico:'Windows ICO',txt:'文本文件',svg:'SVG 矢量图'}
export async function beginFileExport(win:BrowserWindow,name:string,format:Format){
 if(!ALLOWED.includes(format))throw Error('不支持的文件格式')
 const basename=path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,128)
 const expected='.'+format
 const candidate=basename.toLowerCase().endsWith(expected)?basename:basename+expected
 const picked=await dialog.showSaveDialog(win,{title:'保存文件',defaultPath:candidate,filters:[{name:suffixes[format],extensions:[format]}]})
 if(picked.canceled||!picked.filePath)return null
 if(path.extname(picked.filePath).toLowerCase()!==expected)throw Error('保存文件扩展名不正确')
 const target=path.resolve(picked.filePath)
 const temp=path.join(path.dirname(target),'.tooldock-'+randomUUID()+'.part')
 const fd=fs.openSync(temp,'wx',0o600),id=randomUUID()
 sessions.set(id,{fd,temp,target,length:0})
 return id
}
export function appendExportChunk(id:string,bytes:Uint8Array){
 const s=sessions.get(id)
 if(!s)throw Error('导出会话已失效')
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>524288)throw Error('导出数据块过大')
 if(s.length+bytes.byteLength>1024*1024*1024){cancelFileExport(id);throw Error('文件超过 1 GiB 导出限制')}
 const buffer=Buffer.from(bytes)
 let offset=0
 while(offset<buffer.length)offset+=fs.writeSync(s.fd,buffer,offset,buffer.length-offset)
 s.length+=bytes.byteLength
}
export function cancelFileExport(id:string){
 const s=sessions.get(id);if(!s)return
 sessions.delete(id)
 try{fs.closeSync(s.fd)}catch{}
 try{fs.unlinkSync(s.temp)}catch{}
}
export function finishFileExport(id:string){
 const s=sessions.get(id);if(!s)throw Error('导出会话已失效')
 try{
  fs.fsyncSync(s.fd);fs.closeSync(s.fd)
  sessions.delete(id)
  fs.renameSync(s.temp,s.target)
  return s.target
 }catch(e){
  sessions.delete(id)
  try{fs.closeSync(s.fd)}catch{}
  try{fs.unlinkSync(s.temp)}catch{}
  throw e
 }
}
export function disposeAllExports(){for(const id of sessions.keys())cancelFileExport(id)}
