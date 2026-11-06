import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import type {MediaTask} from '../../../../src/shared/mediaModels'
import {ffmpegBinaries,whisperBinary} from './engines'
import {copyExtension,publishOutput,temporaryOutput,validateSrt} from './media-files'
import {runProcess} from './process'

export async function executeMediaTask(task:MediaTask,signal:AbortSignal,runtime:string,workspace:string,resolveModel:(id:string)=>Promise<string>,change:()=>void){
 const options=task.options!,binaries=await ffmpegBinaries(options.ffmpegOverride)
 const directory=options.outputDirectory||path.dirname(task.inputPath)
 const track=task.probe.audioTracks.find(x=>x.index===task.audioIndex)
 if(!track)throw Error('所选音轨已失效')
 const extension=task.kind==='subtitle'?'srt':options.outputFormat==='copy'?copyExtension(track.codec):options.outputFormat
 const temp=await temporaryOutput(directory,extension,task.id)
 task.temporaryPath=temp;change()
 try{
  let pending=''
  const progress=(text:string)=>{pending=(pending+text).slice(-8192);const matches=[...pending.matchAll(/out_time_(?:us|ms)=(\d+)/g)];const last=matches.at(-1);if(last&&task.probe.duration){task.percent=Math.min(task.kind==='subtitle'?15:99,Number(last[1])/1e6/task.probe.duration*(task.kind==='subtitle'?15:100));change()}if(pending.length>4000)pending=pending.slice(-1000)}
  const base=['-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','file,pipe','-i',task.inputPath,'-map','0:'+task.audioIndex,'-vn','-sn','-dn']
  if(task.kind==='extract'){
   const codec=options.outputFormat==='copy'?['-c:a','copy']:options.outputFormat==='mp3'?['-c:a','libmp3lame','-b:a',options.bitrate]:options.outputFormat==='m4a'?['-c:a','aac','-b:a',options.bitrate]:options.outputFormat==='wav'?['-c:a','pcm_s16le']:['-c:a','flac']
   await runProcess(binaries.ffmpeg,[...base,...codec,'-progress','pipe:1','-n',temp],signal,progress)
  }else{
   const pcm=path.join(workspace,'audio.wav')
   await runProcess(binaries.ffmpeg,[...base,'-ac','1','-ar','16000','-c:a','pcm_s16le','-progress','pipe:1','-n',pcm],signal,progress)
   const model=await resolveModel(options.selectedModelId),output=path.join(workspace,'result')
   const recognize=async(gpu:boolean)=>{
    const binary=await whisperBinary(runtime,gpu)
    let deviceEvidence=false,progressBuffer=''
    task.device=gpu?'CUDA 启动验证中':'CPU';change()
    await fs.rm(output+'.srt',{force:true})
    const args=['-m',model,'-f',pcm,'-l',options.language,'-osrt','-of',output,'-t',String(Math.max(1,Math.min(8,os.cpus().length-1))),'-pp']
    if(!gpu)args.push('-ng')
    await runProcess(binary,args,signal,text=>{
     progressBuffer=(progressBuffer+text).slice(-8192)
     if(/(?:CUDA\d*|CUDA_Host)\s+(?:compute|model)\s+buffer|using\s+(?:device\s+)?CUDA|assigned to device CUDA/i.test(progressBuffer))deviceEvidence=true
     const matches=[...progressBuffer.matchAll(/progress\s*=\s*(\d+)%/g)];if(matches.length){task.percent=15+Math.min(84,Number(matches.at(-1)![1])*.84);change()}
    })
    if(gpu&&!deviceEvidence)throw Error('CUDA 引擎未报告 GPU 计算设备，无法确认硬件加速')
    task.device=gpu?'CUDA GPU':'CPU';change()
   }
   if(options.computeMode==='cpu')await recognize(false)
   else try{await recognize(true)}catch(error){if(signal.aborted||options.computeMode==='gpu')throw error;task.fallbackReason=error instanceof Error?error.message:'CUDA 不可用';task.percent=15;change();await recognize(false)}
   const stat=await fs.stat(output+'.srt');if(stat.size>16*1024*1024)throw Error('字幕结果超过16 MiB限制')
   const srt=validateSrt(await fs.readFile(output+'.srt','utf8'),task.probe.duration)
   if(!srt)throw Error('未识别到有效语音，未生成字幕')
   await fs.writeFile(temp,srt,{flag:'wx'})
  }
  if(signal.aborted)throw Error('任务已取消')
  const stat=await fs.stat(temp);if(!stat.isFile()||stat.size===0)throw Error('处理结果为空')
  task.outputPath=await publishOutput(temp,task.inputPath,directory,extension,signal)
 }finally{await fs.rm(temp,{force:true}).catch(()=>{});task.temporaryPath=undefined;change()}
}
