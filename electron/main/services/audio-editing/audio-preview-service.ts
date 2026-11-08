import fs from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {Readable} from 'node:stream'
import type {AudioProject,AudioEdit,AudioExportOptions,AudioPeaks} from '../../../../src/shared/audioEditingModels'
import {ffmpegBinaries} from '../media/engines'
import {runProcess} from '../media/process'
import {assertSourceUnchanged,getProjectStream} from './audio-source'
import {audioGraph} from './audio-filtergraph'

const previewOptions:AudioExportOptions={format:'mp3',bitrate:'128k',directory:'',name:'preview',sampleRate:'source',channels:'source'}
export class AudioPreviewService{
 private root=''
 private queueCount=0
 private tail:Promise<unknown>=Promise.resolve()
 private active=new Set<AbortController>()
 private tokens=new Map<string,{file:string;expires:number}>()
 private closing=false
 constructor(private dataRoot:()=>string){}
 async initialize(){this.root=path.join(this.dataRoot(),'audio-preview-cache');await fs.mkdir(this.root,{recursive:true})}
 isBusy(){return this.queueCount>0||this.active.size>0}
 private schedule<T>(callback:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  if(this.closing)return Promise.reject(Error('预览服务已退出'))
  this.queueCount++
  const result=this.tail.catch(()=>{}).then(async()=>{
   if(this.closing){this.queueCount--;throw Error('预览服务已退出')}
   const ctl=new AbortController();this.active.add(ctl)
   try{return await callback(ctl.signal)}
   finally{this.active.delete(ctl);this.queueCount--}
  })
  this.tail=result.catch(()=>{})
  return result
 }
 private folder(id:string){if(!/^[0-9a-f-]{36}$/.test(id))throw Error('无效预览工程');return path.join(this.root,id)}
 async preview(p:AudioProject,edited:boolean,limit:number){
  const stream=getProjectStream(p.source,p.streamIndex)
  const filename=edited?'edited-'+p.revision+'.mp3':'original.mp3'
  const folder=this.folder(p.id),file=path.join(folder,filename)
  return this.schedule(async signal=>{
   await assertSourceUnchanged(p.source);await fs.mkdir(folder,{recursive:true})
   const existing=await fs.stat(file).catch(()=>null)
   if(!existing?.size){
    const {ffmpeg}=await ffmpegBinaries('')
    const temp=path.join(folder,'.preview-'+randomUUID()+'.mp3')
    const edit:AudioEdit=edited?p.edit:{...p.edit,kept:[{startUs:0,endUs:stream.durationUs}],effect:'none'}
    const graph=audioGraph(stream,edit,previewOptions)
    try{
     await runProcess(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',p.source.path,
      ...graph.args,...graph.map,'-vn','-sn','-dn','-c:a','libmp3lame','-b:a','96k','-n',temp],signal)
     const info=await fs.stat(temp);if(!info.size||info.size>limit)throw Error('预览缓存超出容量限制，仍可直接使用时间轴剪辑或导出')
     await fs.rename(temp,file)
    }finally{await fs.rm(temp,{force:true}).catch(()=>{})}
   }
   await fs.utimes(file,new Date(),new Date())
   const token=randomUUID();this.tokens.set(token,{file,expires:Date.now()+15*60*1000})
   await this.cleanup(limit)
   return 'tooldock-audio://cache/'+token
  })
 }
 async peaks(p:AudioProject,startUs:number,endUs:number,count:number):Promise<AudioPeaks>{
  const stream=getProjectStream(p.source,p.streamIndex)
  if(!Number.isFinite(startUs)||!Number.isFinite(endUs)||!Number.isInteger(count)||count<40||count>4096||startUs<0||endUs>stream.durationUs||endUs<=startUs)throw Error('波形范围无效')
  return this.schedule(async signal=>{
   await assertSourceUnchanged(p.source)
   const {ffmpeg}=await ffmpegBinaries('')
   const start=startUs/1e6,duration=(endUs-startUs)/1e6,points=new Array<number>(count).fill(0)
   await new Promise<void>((resolve,reject)=>{
    const args=['-nostdin','-hide_banner','-loglevel','error','-ss',String(start),'-protocol_whitelist','file,pipe',
     '-i',p.source.path,'-map','0:'+stream.index,'-vn','-t',String(duration),'-ac','1','-ar','2000','-f','s16le','-c:a','pcm_s16le','pipe:1']
    const child=spawn(ffmpeg,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']})
    let samples=0,previous:Buffer|null=null,stderr='',done=false
    const end=(err?:Error)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);err?reject(err):resolve()}
    const abort=()=>child.kill()
    signal.addEventListener('abort',abort,{once:true})
    child.stdout.on('data',(chunk:Buffer)=>{
     const bytes=previous?Buffer.concat([previous,chunk]):chunk
     const usable=bytes.length-bytes.length%2
     for(let i=0;i<usable;i+=2){
      const pos=Math.min(count-1,Math.floor(samples/(duration*2000)*count))
      points[pos]=Math.max(points[pos],Math.abs(bytes.readInt16LE(i))/32768)
      samples++
     }
     previous=usable===bytes.length?null:Buffer.from(bytes.subarray(usable))
    })
    child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-2000)})
    child.on('error',e=>end(e))
    child.on('close',code=>end(signal.aborted?Error('波形已取消'):code===0?undefined:Error('生成波形失败：'+stderr.slice(-300))))
   })
   return{points,durationUs:stream.durationUs}
  })
 }
 invalidate(ids:string[]){
  for(const [token,item] of this.tokens)if(ids.some(id=>item.file.startsWith(this.folder(id)+path.sep)))this.tokens.delete(token)
 }
 async respond(request:Request):Promise<Response>{
  const url=new URL(request.url)
  if(url.host!=='cache'||request.method!=='GET')return new Response('Not Found',{status:404})
  const token=url.pathname.slice(1),value=this.tokens.get(token)
  if(!value||value.expires<Date.now())return new Response('Expired',{status:404})
  value.expires=Date.now()+15*60*1000
  const info=await fs.stat(value.file).catch(()=>null)
  if(!info?.isFile())return new Response('Missing',{status:404})
  const range=request.headers.get('range'),size=info.size
  let start=0,end=size-1,status=200
  if(range){
   const m=/^bytes=(\d*)-(\d*)$/.exec(range)
   if(!m)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}})
   if(m[1])start=Number(m[1])
   if(m[2])end=Number(m[2])
   if(!m[1]&&m[2]){start=Math.max(0,size-Number(m[2]));end=size-1}
   if(start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}})
   end=Math.min(size-1,end);status=206
  }
  const headers:Record<string,string>={'Content-Type':'audio/mpeg','Content-Length':String(end-start+1),'Accept-Ranges':'bytes',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
  if(status===206)headers['Content-Range']='bytes '+start+'-'+end+'/'+size
  return new Response(Readable.toWeb(createReadStream(value.file,{start,end})) as unknown as BodyInit,{status,headers})
 }
 private async cleanup(limit:number){
  const now=Date.now()
  for(const [token,item] of this.tokens)if(item.expires<now)this.tokens.delete(token)
  const protectedPaths=new Set([...this.tokens.values()].map(t=>t.file))
  const entries:{path:string;size:number;mtime:number}[]=[]
  for(const dir of await fs.readdir(this.root,{withFileTypes:true})){
   if(!dir.isDirectory()||!/^[0-9a-f-]{36}$/.test(dir.name))continue
   for(const item of await fs.readdir(path.join(this.root,dir.name),{withFileTypes:true})){
    if(!item.isFile()||!/^((original|edited-\d+)\.mp3|\.preview-[0-9a-f-]{36}\.mp3)$/.test(item.name))continue
    const file=path.join(this.root,dir.name,item.name),info=await fs.lstat(file)
    if(info.isFile()&&!info.isSymbolicLink())entries.push({path:file,size:info.size,mtime:info.mtimeMs})
   }
  }
  let total=entries.reduce((sum,x)=>sum+x.size,0)
  for(const item of entries.sort((a,b)=>a.mtime-b.mtime)){
   if(total<=limit)break
   if(protectedPaths.has(item.path))continue
   await fs.unlink(item.path).catch(()=>{});total-=item.size
  }
 }
 async shutdown(){
  this.closing=true
  for(const active of this.active)active.abort()
  await this.tail.catch(()=>{})
  this.tokens.clear()
  // 预览目录是独立且可再生的缓存，只清理经UUID确认的受控子目录。
  for(const dir of await fs.readdir(this.root,{withFileTypes:true}).catch(()=>[])){
   if(dir.isDirectory()&&/^[0-9a-f-]{36}$/.test(dir.name))await fs.rm(path.join(this.root,dir.name),{recursive:true,force:true}).catch(()=>{})
  }
 }
}
