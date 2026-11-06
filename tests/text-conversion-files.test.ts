import {describe,it,expect,afterEach} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {scanFiles,assertUnchanged,validName,publishExclusive} from '../electron/main/services/text-conversion/files'
let dir=''
const setup=async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'tooldock-text-tests-'));return dir}
afterEach(async()=>{if(dir)await fs.rm(dir,{recursive:true,force:true});dir=''})
describe('简繁转换文件校验与导出',()=>{
 it('限制文件类型且去重，允许一级扫描',async()=>{
  const root=await setup(),source=path.join(root,'sample.srt')
  await fs.writeFile(source,'繁體')
  await fs.writeFile(path.join(root,'image.png'),'not image')
  const next=path.join(root,'sub');await fs.mkdir(next);await fs.writeFile(path.join(next,'child.srt'),'x')
  const scanned=await scanFiles([source,root])
  expect(scanned.files).toHaveLength(1)
  expect(scanned.skipped.some(item=>item.path.endsWith('.png'))).toBe(true)
  await fs.writeFile(source,'修改')
  await expect(assertUnchanged(scanned.files[0])).rejects.toThrow('源文件已经改变')
 })
 it('拒绝 Windows 危险名称',()=>{
  for(const name of ['CON','LPT1','sub/name','bad:word','foo.','  ','name\\path'])expect(()=>validName(name,'srt')).toThrow()
  expect(validName('字幕01','srt')).toBe('字幕01')
 })
 it('自动编号且不覆盖现有文件或源文件',async()=>{
  const root=await setup(),source=path.join(root,'subtitle.txt'),out=path.join(root,'subtitle_simplify.txt')
  await fs.writeFile(source,'原始')
  await fs.writeFile(out,'已存在')
  const first=await publishExclusive(source,out,[source])
  const second=await publishExclusive(source,out,[source])
  expect(path.basename(first)).toBe('subtitle_simplify (1).txt')
  expect(path.basename(second)).toBe('subtitle_simplify (2).txt')
  expect(await fs.readFile(out,'utf8')).toBe('已存在')
  expect(await fs.readFile(source,'utf8')).toBe('原始')
 })
})
