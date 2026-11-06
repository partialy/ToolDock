import fs from 'node:fs/promises'
import path from 'node:path'
import {app} from 'electron'
import {runProcess} from './process'
import lock from '../../../../resources/media/binaries.lock.json'

export function mediaBinaryRoot(){return app.isPackaged?path.join(process.resourcesPath,'media','bin'):path.resolve('resources/media/bin')}
async function exists(file:string){return fs.access(file).then(()=>true,()=>false)}
export async function ffmpegBinaries(override=''){
 const directory=override?path.dirname(override):path.join(mediaBinaryRoot(),'ffmpeg')
 const ffmpeg=override||path.join(directory,'ffmpeg.exe'),ffprobe=path.join(directory,'ffprobe.exe')
 if(!await exists(ffmpeg)||!await exists(ffprobe))throw Error('FFmpeg 或 ffprobe 未安装，请运行媒体资源构建脚本或选择完整 FFmpeg 目录')
 return{ffmpeg,ffprobe}
}
export async function validateFfmpeg(file:string){
 if(!path.isAbsolute(file)||path.basename(file).toLowerCase()!=='ffmpeg.exe')throw Error('请选择 ffmpeg.exe')
 const binaries=await ffmpegBinaries(file),signal=new AbortController().signal
 await runProcess(binaries.ffmpeg,['-version'],signal,undefined,10000);await runProcess(binaries.ffprobe,['-version'],signal,undefined,10000)
 return file
}
export async function whisperBinary(runtime:string,gpu:boolean){
 const root=gpu?path.join(runtime,'cuda'):path.join(mediaBinaryRoot(),'whisper')
 for(const name of ['whisper-cli.exe','main.exe']){const file=path.join(root,name);if(await exists(file))return file}
 throw Error(gpu?'CUDA 引擎尚未安装':'CPU Whisper 引擎尚未安装')
}
let gpuInfo:Promise<{gpuName?:string;gpuMemory?:string}>|undefined
function detectGpu(){
 if(!gpuInfo)gpuInfo=(async()=>{
  try{
   const binary=path.join(process.env.SystemRoot||'C:\\Windows','System32','nvidia-smi.exe')
   const result=await runProcess(binary,['--query-gpu=name,memory.total','--format=csv,noheader,nounits'],new AbortController().signal,undefined,4000)
   const lines=result.stdout.trim().split(/\r?\n/).filter(Boolean).slice(0,8)
   return{gpuName:lines.map(line=>line.split(',')[0].trim()).join(' / '),gpuMemory:lines.map(line=>line.split(',')[1]?.trim()+' MiB').join(' / ')}
  }catch{return{}}
 })()
 return gpuInfo
}
export async function engineStatus(runtime:string){return{cpuAvailable:await whisperBinary(runtime,false).then(()=>true,()=>false),cudaAvailable:await whisperBinary(runtime,true).then(()=>true,()=>false),version:lock.whisper.version,...await detectGpu()}}
