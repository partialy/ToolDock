import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import type {AudioSource,AudioStream} from '../../../../src/shared/audioEditingModels'
import {ffmpegBinaries} from '../media/engines'
import {runProcess} from '../media/process'

const toUs=(value:unknown)=>Math.round((Number(value)||0)*1e6)
async function fileIdentity(file:string){
 const info=await fs.lstat(file)
 if(!info.isFile()||info.isSymbolicLink())throw Error('源媒体必须是普通文件，不能是符号链接')
 const stat=await fs.stat(file),size=stat.size
 const fd=await fs.open(file,'r')
 const hash=createHash('sha256')
 try{
  const bytes=Math.min(65536,size),start=Buffer.alloc(bytes),end=Buffer.alloc(bytes)
  if(bytes){await fd.read(start,0,bytes,0);await fd.read(end,0,bytes,Math.max(0,size-bytes))}
  hash.update(start).update(end)
 }finally{await fd.close()}
 return{size,mtimeMs:stat.mtimeMs,signature:size+':'+stat.mtimeMs+':'+hash.digest('hex')}
}
export async function probeAudioSource(file:string,signal:AbortSignal):Promise<AudioSource>{
 const inputInfo=await fs.lstat(file)
 if(inputInfo.isSymbolicLink()||!inputInfo.isFile())throw Error('不允许使用符号链接或非常规源文件')
 const canonical=await fs.realpath(file)
 const before=await fileIdentity(canonical)
 const {ffprobe}=await ffmpegBinaries('')
 const output=await runProcess(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',canonical],signal,undefined,30000)
 const data=JSON.parse(output.stdout) as {streams?:Record<string,any>[];format?:Record<string,any>}
 const containerDuration=toUs(data.format?.duration)
 const streams:AudioStream[]=(data.streams||[]).filter(s=>s.codec_type==='audio').slice(0,64).map(s=>({
  index:Number(s.index),codec:String(s.codec_name||'unknown'),
  sampleRate:Number(s.sample_rate)||0,channels:Number(s.channels)||0,
  startUs:toUs(s.start_time),durationUs:toUs(s.duration)||containerDuration,
  language:String(s.tags?.language||''),title:String(s.tags?.title||'')
 })).filter(s=>Number.isSafeInteger(s.index)&&s.durationUs>=10000&&s.sampleRate>0)
 if(!streams.length)throw Error('未检测到可编辑的有效音轨')
 const after=await fileIdentity(canonical)
 if(before.signature!==after.signature)throw Error('探测过程中源文件发生变化，请重试')
 const hasVideo=(data.streams||[]).some(s=>s.codec_type==='video'&&!s.disposition?.attached_pic)
 return{path:canonical,name:path.basename(canonical),type:hasVideo?'video':'audio',...before,streams}
}
export async function assertSourceUnchanged(source:AudioSource){
 const current=await fileIdentity(source.path)
 if(source.signature!==current.signature)throw Error('源文件已移动或修改，请重新关联并确认剪辑区间')
}
export function getProjectStream(source:AudioSource,index:number){
 const stream=source.streams.find(s=>s.index===index)
 if(!stream)throw Error('选定音轨已失效')
 return stream
}
export function validAudioBaseName(value:string){
 const name=value.trim()
 if(!name||name.length>150||/[<>:"/\\|?*\u0000-\u001f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
  throw Error('输出名称包含非法字符、Windows保留名称或长度超限')
 return name
}
