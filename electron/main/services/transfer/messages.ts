import {createReadStream,promises as fs} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {StringDecoder} from 'node:string_decoder'
import type {IncomingMessage} from 'node:http'
import path from 'node:path'
import type {PoolMessage} from '../../../../src/shared/fileTransferModels'

type Internal=Omit<PoolMessage,'text'>&{file:string|null;text:string|null}
const LIMIT=300
const INLINE=2000
const BUFFER_BYTES=64*1024
const MIN_FREE=2*1024**3

/** Shared ephemeral text clipboard. Large messages are streamed to disk, not SQLite. */
export class MessagePool {
 private root:string|null=null
 private generation=0
 private messages:Internal[]=[]
 constructor(private changed:()=>void){}
 async open(temp:string){this.generation++;this.root=path.join(temp,'messages');this.messages=[];await fs.mkdir(this.root,{recursive:true})}
 list(after=0,limit=300){
  const items=this.messages.filter(m=>m.createdAt>after).slice(-Math.min(limit,LIMIT)).map(({file,text,...metadata})=>({...metadata,text:text??undefined}))
  return {items,total:this.messages.length}
 }
 get(id:string){const value=this.messages.find(m=>m.id===id);if(!value)throw Error('消息已被清理');return value}
 get usedBytes(){return this.messages.filter(m=>m.file).reduce((sum,m)=>sum+m.bytes,0)}
 async publish(req:IncomingMessage,from:{deviceId:string;deviceName:string}){
  if(!this.root)throw Error('消息池未运行')
  const generation=this.generation,root=this.root
  const id=randomUUID(),file=path.join(root,id+'.txt.part')
  const stream=await fs.open(file,'wx',0o600)
  const decoder=new StringDecoder('utf8')
  let chars=0,bytes=0,preview='',inline='',failed=true
  const consume=(part:string)=>{
   chars+=[...part].length
   if(preview.length<500)preview+=[...part].slice(0,500-preview.length).join('')
   if(chars<=INLINE)inline+=part
  }
  try{
   for await(const chunk of req){
    if(generation!==this.generation)throw Error('消息池已清空，消息发送取消')
    const data=Buffer.from(chunk as Buffer)
    bytes+=data.length
    if(bytes% (8*1024**2)<data.length){
     const disk=await fs.statfs(this.root)
     if(disk.bavail*disk.bsize<MIN_FREE)throw Error('磁盘剩余空间不足，消息未保存')
    }
    // Node streams impose backpressure; never accumulate the full message in RAM.
    await stream.write(data,0,data.length,null)
    consume(decoder.write(data))
   }
   consume(decoder.end())
   if(!bytes)throw Error('不能发送空白消息')
   if(!inline.trim()&&chars<=INLINE)throw Error('不能发送空白消息')
   await stream.sync()
   if(generation!==this.generation)throw Error('消息池已清空，消息发送取消')
   failed=false
  }finally{await stream.close();if(failed)await fs.rm(file,{force:true}).catch(()=>{})}
  const big=chars>INLINE
  const final=path.join(root,id+'.txt')
  if(big)await fs.rename(file,final)
  else await fs.rm(file,{force:true})
  const item:Internal={id,deviceId:from.deviceId,deviceName:from.deviceName,createdAt:Date.now(),charCount:chars,bytes,preview:preview.slice(0,200),kind:big?'file':'text',file:big?final:null,text:big?null:inline}
  this.messages.push(item)
  while(this.messages.length>LIMIT){const old=this.messages.shift()!;if(old.file)await fs.rm(old.file,{force:true}).catch(()=>{})}
  this.changed();return {id,kind:item.kind}
 }
 async remove(ids:string[]){
  for(const id of ids){const item=this.get(id);if(item.file)await fs.rm(item.file,{force:true});this.messages=this.messages.filter(m=>m.id!==id)}
  this.changed()
 }
 async clear(){this.generation++;for(const item of this.messages)if(item.file)await fs.rm(item.file,{force:true}).catch(()=>{});this.messages=[];this.changed()}
 async close(){await this.clear();this.root=null}
 async text(id:string){const item=this.get(id);return item.file?await fs.readFile(item.file,'utf8'):item.text||''}
 async chunk(id:string,offset=0){
  const item=this.get(id)
  if(!Number.isSafeInteger(offset)||offset<0||offset>item.bytes)throw Error('无效的文本偏移')
  if(!item.file)return {text:item.text||'',nextOffset:item.bytes,done:true}
  const handle=await fs.open(item.file,'r')
  try{
   const length=Math.min(BUFFER_BYTES,item.bytes-offset),buf=Buffer.alloc(length)
   const {bytesRead}=await handle.read(buf,0,length,offset)
   let end=bytesRead
   if(offset+end<item.bytes){
    const decoder=new TextDecoder('utf-8',{fatal:true})
    while(end>0){try{decoder.decode(buf.subarray(0,end));break}catch{end--}}
   }
   if(end===0&&bytesRead>0)throw Error('无法解析 UTF-8 分片')
   return {text:buf.subarray(0,end).toString('utf8'),nextOffset:offset+end,done:offset+end>=item.bytes}
  }finally{await handle.close()}
 }
 async search(id:string,query:string){
  if(!query||query.length>128)throw Error('搜索词长度必须为 1–128 字符')
  const item=this.get(id),hits:{offset:number;snippet:string}[]=[]
  if(!item.file){const src=item.text||'';let p=0;while((p=src.indexOf(query,p))>=0&&hits.length<20){hits.push({offset:p,snippet:src.slice(Math.max(0,p-40),p+query.length+40)});p+=query.length}return hits}
  const stream=createReadStream(item.file,{encoding:'utf8',highWaterMark:64*1024})
  let previous='',position=0
  try{
   for await(const piece of stream){
    const chunk=String(piece),value=previous+chunk
    let p=0
    while((p=value.indexOf(query,p))>=0&&hits.length<20){
     hits.push({offset:position-previous.length+p,snippet:value.slice(Math.max(0,p-50),p+query.length+50)})
     p+=query.length
    }
    position+=chunk.length;previous=value.slice(-Math.max(query.length,80))
    if(hits.length>=20)break
   }
  }finally{stream.destroy()}
  return hits
 }
}
