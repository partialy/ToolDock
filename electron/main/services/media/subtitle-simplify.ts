import fs from 'node:fs/promises'
import path from 'node:path'
import {constants} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {conversionPreferencesSchema,type ConversionEncoding,type ConversionPreferences} from '../../../../src/shared/textConversionModels'
import {publishExclusive} from '../text-conversion/files'
import {runConversionWorker} from '../text-conversion/worker-runner'

const MAX_SUBTITLE_BYTES=16*1024*1024
export const SUBTITLE_SIMPLIFY_PREFERENCES:ConversionPreferences=conversionPreferencesSchema.parse({
 direction:'simplify',region:'general',phraseConversion:false,suffix:'_simplify',inputEncoding:'auto',outputEncoding:'utf8'
})

export type SubtitleFileConverter=(inputPath:string,outputPath:string,settings:ConversionPreferences,encoding:ConversionEncoding,signal?:AbortSignal)=>Promise<unknown>

const defaultConverter:SubtitleFileConverter=(inputPath,outputPath,settings,encoding,signal)=>
 runConversionWorker({inputPath,outputPath,settings,encoding,signal})

/** 使用现有简繁转换引擎将已生成的 SRT 字幕转为通用简体，并无覆盖保存到同目录（原命名+_simplify）。 */
export async function simplifySubtitleFile(
 sourcePath:string,
 forbiddenPaths:string[],
 workspaceRoot:string,
 signal?:AbortSignal,
 convert:SubtitleFileConverter=defaultConverter
):Promise<string>{
 let stat
 try{stat=await fs.lstat(sourcePath)}
 catch{throw Error('字幕文件不存在或已被移动')}
 if(stat.isSymbolicLink()||!stat.isFile())throw Error('字幕文件无效，不支持符号链接或目录')
 if(stat.size>MAX_SUBTITLE_BYTES)throw Error('字幕文件超过 16 MiB 限制')
 if(path.extname(sourcePath).toLowerCase()!=='.srt')throw Error('仅支持转换 SRT 字幕文件')
 const parsed=path.parse(sourcePath)
 await fs.access(parsed.dir,constants.W_OK).catch(()=>{throw Error('字幕所在目录不可写')})
 const stageDir=path.join(workspaceRoot,randomUUID())
 await fs.mkdir(stageDir,{recursive:true})
 const stage=path.join(stageDir,'simplified.srt')
 const target=path.join(parsed.dir,parsed.name+'_simplify'+parsed.ext)
 try{
  await convert(sourcePath,stage,SUBTITLE_SIMPLIFY_PREFERENCES,'auto',signal)
  const outStat=await fs.stat(stage).catch(()=>null)
  if(!outStat?.isFile()||outStat.size===0)throw Error('简繁转换结果为空')
  return await publishExclusive(stage,target,[...new Set([...forbiddenPaths,sourcePath])],signal)
 }finally{
  await fs.rm(stageDir,{recursive:true,force:true}).catch(()=>{})
 }
}
