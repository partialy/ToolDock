import fs from 'node:fs/promises'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type {MediaKind,MediaProbe} from '../../../../src/shared/mediaModels'
import {runProcess} from './process'

const video=new Set('mp4 mkv mov avi flv webm ts mts m2ts mpg mpeg m4v wmv ogv 3gp'.split(' '))
const audio=new Set('mp3 wav flac m4a aac ogg opus wma aiff aif'.split(' '))
export async function scanSources(inputs:string[],kind:MediaKind){
 const files:string[]=[],skipped:{path:string;reason:string}[]=[],seen=new Set<string>()
 const add=async(p:string)=>{try{const stat=await fs.lstat(p);if(stat.isSymbolicLink()||!stat.isFile())return;const ext=path.extname(p).slice(1).toLowerCase();if(!video.has(ext)&&!(kind==='subtitle'&&audio.has(ext))){skipped.push({path:p,reason:'不支持的媒体类型'});return}const real=await fs.realpath(p),key=real.toLowerCase();if(seen.has(key))return;seen.add(key);if(files.length>=1000){skipped.push({path:p,reason:'单次最多导入1000个文件'});return}files.push(real)}catch{skipped.push({path:p,reason:'文件无法访问'})}}
 for(const p of inputs){if(!path.isAbsolute(p)){skipped.push({path:p,reason:'需要绝对路径'});continue}try{const stat=await fs.lstat(p);if(stat.isSymbolicLink()){skipped.push({path:p,reason:'不扫描符号链接'});continue}if(stat.isDirectory()){const dir=await fs.opendir(p);let count=0;for await(const entry of dir){if(++count>10000){skipped.push({path:p,reason:'目录条目超过10000，已停止扫描'});break}if(entry.isFile())await add(path.join(p,entry.name))}}else await add(p)}catch{skipped.push({path:p,reason:'目录无法访问'})}}
 return{files,skipped:skipped.slice(0,1000)}
}
export async function probeMedia(binary:string,input:string,signal:AbortSignal):Promise<MediaProbe>{
 const result=await runProcess(binary,['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',input],signal,undefined,30000)
 const data=JSON.parse(result.stdout)
 const streams=Array.isArray(data.streams)?data.streams:[]
 return{duration:Math.max(0,Number(data.format?.duration)||0),hasVideo:streams.some((s:any)=>s.codec_type==='video'&&!s.disposition?.attached_pic),audioTracks:streams.filter((s:any)=>s.codec_type==='audio').slice(0,64).map((s:any)=>({index:Number(s.index),codec:String(s.codec_name||''),language:String(s.tags?.language||''),title:String(s.tags?.title||''),channels:Number(s.channels)||0}))}
}
export function copyExtension(codec:string){const map:Record<string,string>={aac:'m4a',alac:'m4a',mp3:'mp3',flac:'flac',opus:'ogg',vorbis:'ogg',ac3:'ac3',eac3:'eac3',dts:'dts',pcm_s16le:'wav',pcm_s24le:'wav',pcm_s32le:'wav',pcm_f32le:'wav'};if(!Object.hasOwn(map,codec))throw Error('该原音轨编码暂不支持无损复制，请选择转码格式');return map[codec]}
export async function createWorkspace(root:string,id:string){const folder=path.join(root,id);await fs.mkdir(folder,{recursive:true});return folder}
/** hard-link 的目标创建具有排他语义；绝不覆盖现有文件。临时输出放在目标卷。 */
export async function publishOutput(temp:string,input:string,directory:string,extension:string,signal?:AbortSignal){
 const base=path.parse(input).name
 for(let index=0;index<10000;index++){
  if(signal?.aborted)throw Error('任务已取消')
  const output=path.join(directory,base+(index?' ('+index+')':'')+'.'+extension)
  try{try{await fs.link(temp,output)}catch(error){const code=(error as NodeJS.ErrnoException).code;if(!['EPERM','EXDEV','ENOTSUP','EOPNOTSUPP','UNKNOWN'].includes(code||''))throw error
    // FAT/exFAT/部分网络盘没有硬链接：COPYFILE_EXCL 仍保证排他创建。
    await fs.copyFile(temp,output,fs.constants.COPYFILE_EXCL)
   }
   if(signal?.aborted){await fs.unlink(output);throw Error('任务已取消')}
   await fs.unlink(temp);return output
  }catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')continue;throw e}
 }
 throw Error('同名文件过多，无法分配输出名称')
}
export async function temporaryOutput(directory:string,extension:string,id:string=randomUUID()){await fs.access(directory,fs.constants.W_OK);return path.join(directory,'.tooldock-media-'+id+'.'+extension)}
export function validateSrt(text:string,duration:number){
 const normalized=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim()
 if(!normalized)return ''
 const blocks=normalized.split(/\n\s*\n/);let previous=0
 const time=(h:string,m:string,s:string,ms:string)=>Number(h)*3600+Number(m)*60+Number(s)+Number(ms)/1000
 for(const block of blocks){const lines=block.split('\n');if(!/^\d+$/.test(lines[0]))throw Error('字幕序号无效');const match=lines[1]?.match(/^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3}) --> (\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/);if(!match)throw Error('字幕时间戳无效');const start=time(...match.slice(1,5) as [string,string,string,string]),end=time(...match.slice(5,9) as [string,string,string,string]);if(start<previous||end<start||(duration>0&&end>duration+2))throw Error('字幕时间轴超出有效范围');previous=start;if(!lines.slice(2).join('').trim())throw Error('字幕文本为空')}
 return normalized.replace(/\n/g,'\r\n')+'\r\n'
}
