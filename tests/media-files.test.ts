import {describe,it,expect,afterEach} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import {scanSources,copyExtension,publishOutput,validateSrt} from '../electron/main/services/media/media-files'
const roots:string[]=[]
async function fixture(){const root=await fs.mkdtemp(path.resolve('plans/media-test-'));roots.push(root);return root}
afterEach(async()=>{for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true})})
describe('媒体文件边界',()=>{
 it('只扫描一级、去重、区分音视频任务',async()=>{const root=await fixture();await fs.mkdir(path.join(root,'nested'));await fs.writeFile(path.join(root,'clip.mp4'),'');await fs.writeFile(path.join(root,'sound.mp3'),'');await fs.writeFile(path.join(root,'nested','hidden.mp4'),'');const scan=await scanSources([root,path.join(root,'clip.mp4')],'extract');expect(scan.files.map(p=>path.basename(p))).toEqual(['clip.mp4']);expect(scan.skipped.some(s=>s.path.endsWith('sound.mp3'))).toBe(true);expect((await scanSources([root],'subtitle')).files).toHaveLength(2)})
 it('并发同名输出不会覆盖原文件',async()=>{const root=await fixture(),input=path.join(root,'clip.mp4');await fs.writeFile(path.join(root,'clip.mp3'),'original');const first=path.join(root,'a.mp3'),second=path.join(root,'b.mp3');await fs.writeFile(first,'a');await fs.writeFile(second,'b');const outputs=await Promise.all([publishOutput(first,input,root,'mp3'),publishOutput(second,input,root,'mp3')]);expect(new Set(outputs).size).toBe(2);expect(await fs.readFile(path.join(root,'clip.mp3'),'utf8')).toBe('original')})
 it('原音轨容器匹配编码，拒绝未知编码',()=>{expect(copyExtension('opus')).toBe('ogg');expect(copyExtension('ac3')).toBe('ac3');expect(()=>copyExtension('unknown')).toThrow()})
 it('字幕保留真实时间戳并拒绝倒序和越界',()=>{const text='1\n00:00:01,200 --> 00:00:03,400\n你好';expect(validateSrt(text,10)).toContain('00:00:01,200 --> 00:00:03,400');expect(()=>validateSrt(text,1)).toThrow();expect(()=>validateSrt('1\n00:00:03,000 --> 00:00:01,000\nwrong',10)).toThrow()})
})
