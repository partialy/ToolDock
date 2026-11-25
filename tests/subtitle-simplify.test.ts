import {describe,it,expect,afterEach} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {decodeInput,encodeOutput} from '../electron/main/services/text-conversion/encoding'
import {convertContent} from '../src/lib/text-conversion/conversion-core'
import {simplifySubtitleFile,SUBTITLE_SIMPLIFY_PREFERENCES,type SubtitleFileConverter} from '../electron/main/services/media/subtitle-simplify'

const roots:string[]=[]
const setup=async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'tooldock-sub-simplify-'));roots.push(root);return root}
afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true})})

const localConverter:SubtitleFileConverter=async(inputPath,outputPath,settings,encoding)=>{
 const bytes=await fs.readFile(inputPath)
 const decoded=decodeInput(bytes,encoding)
 const result=convertContent(decoded.text,'srt',settings)
 await fs.writeFile(outputPath,encodeOutput(result,decoded,settings.outputEncoding),{flag:'wx'})
}

describe('字幕识别结果转简体',()=>{
 it('使用通用繁转简配置，在同目录生成 原命名_simplify.srt 且重名不覆盖',async()=>{
  const root=await setup()
  const outDir=path.join(root,'out'),cacheDir=path.join(root,'cache')
  await fs.mkdir(outDir);await fs.mkdir(cacheDir)
  const source=path.join(outDir,'demo (1).srt')
  const rawSrt='1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>繁體字幕測試</i>\r\n'
  await fs.writeFile(source,rawSrt,'utf8')

  const first=await simplifySubtitleFile(source,[source],cacheDir,undefined,localConverter)
  expect(first).toBe(path.join(outDir,'demo (1)_simplify.srt'))
  expect(await fs.readFile(first,'utf8')).toBe('1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>繁体字幕测试</i>\r\n')

  const second=await simplifySubtitleFile(source,[source],cacheDir,undefined,localConverter)
  expect(second).toBe(path.join(outDir,'demo (1)_simplify (1).srt'))
  expect(await fs.readFile(first,'utf8')).toBe('1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>繁体字幕测试</i>\r\n')
  expect(await fs.readFile(source,'utf8')).toBe(rawSrt)
  expect(await fs.readdir(cacheDir)).toEqual([])
 })

 it('使用固定通用繁转简参数并拒绝缺失或非 SRT 文件',async()=>{
  expect(SUBTITLE_SIMPLIFY_PREFERENCES.direction).toBe('simplify')
  expect(SUBTITLE_SIMPLIFY_PREFERENCES.region).toBe('general')
  expect(SUBTITLE_SIMPLIFY_PREFERENCES.phraseConversion).toBe(false)
  const root=await setup(),cacheDir=path.join(root,'cache')
  await fs.mkdir(cacheDir)
  await expect(simplifySubtitleFile(path.join(root,'missing.srt'),[],cacheDir,undefined,localConverter)).rejects.toThrow('字幕文件不存在')
  const txt=path.join(root,'note.txt')
  await fs.writeFile(txt,'繁體','utf8')
  await expect(simplifySubtitleFile(txt,[],cacheDir,undefined,localConverter)).rejects.toThrow('仅支持转换 SRT 字幕文件')
 })
})
