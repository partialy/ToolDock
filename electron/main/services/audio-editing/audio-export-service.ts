import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {AudioExportJob,AudioExportOptions} from '../../../../src/shared/audioEditingModels'
import {estimatedDurationUs} from '../../../../src/shared/audioEditingModels'
import {ffmpegBinaries} from '../media/engines'
import {runProcess} from '../media/process'
import {probeAudioSource,assertSourceUnchanged,validAudioBaseName} from './audio-source'
import {audioExtension,audioGraph,outputCodecArgs,validateAudioExport} from './audio-filtergraph'

function parseLoudness(stderr:string){
 const match=[...stderr.matchAll(/\{\s*"input_i"[\s\S]*?"target_offset"\s*:\s*"[^"]+"\s*\}/g)].at(-1)
 if(!match)throw Error('响度分析未产生有效测量结果')
 const obj=JSON.parse(match[0]) as Record<string,string>
 const result:Record<string,string>={}
 const keys={measured_I:'input_i',measured_TP:'input_tp',measured_LRA:'input_lra',measured_thresh:'input_thresh',offset:'target_offset'}
 for(const [key,source] of Object.entries(keys)){const n=Number(obj[source]);if(!Number.isFinite(n))throw Error('音频响度无法测量，请关闭归一化后重试');result[key]=String(n)}
 return result
}
async function exclusiveOutput(temp:string,directory:string,name:string,extension:string,signal:AbortSignal){
 validAudioBaseName(name)
 for(let i=0;i<10000;i++){
  if(signal.aborted)throw Error('导出已取消')
  const target=path.join(directory,name+(i?' ('+i+')':'')+'.'+extension)
  try{
   await fs.link(temp,target)
   if(signal.aborted){await fs.unlink(target);throw Error('导出已取消')}
   await fs.unlink(temp)
   return target
  }catch(e){
   const err=e as NodeJS.ErrnoException
   if(err.code==='EEXIST')continue
   if(['EPERM','EXDEV','EOPNOTSUPP','ENOTSUP'].includes(err.code||''))throw Error('目标磁盘不支持安全的无覆盖发布，请更换 NTFS 目录后重试')
   throw e
  }
 }
 throw Error('目标目录已存在过多同名文件')
}
export async function renderAudioExport(job:AudioExportJob,signal:AbortSignal,onPercent:(n:number)=>void){
 const stream=job.stream,edit=job.edit,options=job.options
 validateAudioExport(edit,stream,options)
 const {ffmpeg,ffprobe}=await ffmpegBinaries('')
 await assertSourceUnchanged(job.source)
 const directory=options.directory||path.dirname(job.source.path)
 await fs.access(directory,fs.constants.W_OK)
 const extension=audioExtension(stream,options)
 const temp=path.join(directory,'.tooldock-audio-'+job.id+'.'+extension)
 const base=['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',job.source.path]
 let normalization:Record<string,string>|undefined
 if(edit.effect==='normalize'){
  const analysis=audioGraph(stream,edit,options)
  const measure=await runProcess(ffmpeg,[...base.map((v,i)=>i===3?'info':v),...analysis.args,...analysis.map,'-vn','-f','null','-'],signal,undefined)
  normalization=parseLoudness(measure.stderr)
 }
 const graph=audioGraph(stream,edit,options,normalization)
 let buffer=''
 const expected=Math.max(1,estimatedDurationUs(edit))
 const progress=(chunk:string)=>{
  buffer=(buffer+chunk).slice(-4000)
  const hits=[...buffer.matchAll(/out_time_(?:us|ms)=(\d+)/g)]
  if(hits.length)onPercent(Math.min(99,Math.max(0,Number(hits.at(-1)![1])/expected*100)))
 }
 try{
  const args=[...base,...graph.args,...graph.map,'-vn','-sn','-dn','-map_metadata','0','-map_chapters','-1',
   ...outputCodecArgs(options),'-progress','pipe:1','-n',temp]
  await runProcess(ffmpeg,args,signal,progress)
  if(signal.aborted)throw Error('导出已取消')
  const stat=await fs.stat(temp)
  if(!stat.isFile()||stat.size===0)throw Error('FFmpeg 未生成有效音频')
  const verify=await runProcess(ffprobe,['-v','error','-show_entries','stream=codec_type:format=duration','-of','json',temp],signal,undefined,30000)
  const result=JSON.parse(verify.stdout) as {streams?:{codec_type:string}[];format?:{duration?:string}}
  if(!result.streams?.some(s=>s.codec_type==='audio'))throw Error('输出文件不存在有效音轨')
  const realDuration=Number(result.format?.duration)||0
  const intended=expected/1e6
  if(realDuration<=0||Math.abs(realDuration-intended)>Math.max(.5,intended*.06))throw Error('输出时长校验失败，请检查源音轨时间信息')
  await assertSourceUnchanged(job.source)
  return {path:await exclusiveOutput(temp,directory,options.name,extension,signal),size:stat.size}
 }finally{await fs.rm(temp,{force:true}).catch(()=>{})}
}
