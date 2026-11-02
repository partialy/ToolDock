import {describe,it,expect} from 'vitest'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {SharedTree} from '../electron/main/services/transfer/shared-tree'

describe('文件夹分享 / opaque ID / ZIP 目录结构',()=>{
 it('按需列目录，不泄露本地路径，跨层级保留结构和空文件夹',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-tree-test-'))
  try{
   mkdirSync(path.join(temp,'src','inner'),{recursive:true})
   mkdirSync(path.join(temp,'empty'))
   writeFileSync(path.join(temp,'src','inner','hello.txt'),'hello')
   writeFileSync(path.join(temp,'.env'),'SECRET')
   const id=randomUUID(),roots=new Map([[id,{id,file:temp,kind:'directory' as const,name:'example'}]])
   const tree=new SharedTree(()=>roots)
   const root=await tree.list(id)
   expect(root.items.some(x=>x.name==='src'&&x.kind==='directory')).toBe(true)
   expect(root.items.some(x=>x.name==='.env')).toBe(true)
   expect(JSON.stringify(root)).not.toContain(temp)
   const src=root.items.find(x=>x.name==='src')!
   const sub=await tree.list(src.id)
   const inner=sub.items.find(x=>x.name==='inner')!
   const last=await tree.list(inner.id)
   const file=last.items.find(x=>x.name==='hello.txt')!
   const resolved=await tree.resolve(file.id,'file')
   expect(resolved.filepath).toBe(path.join(temp,'src','inner','hello.txt'))
   const zip=await tree.expandZip([id])
   const prefix=path.basename(temp)
   expect(zip.entries.map(x=>x.name)).toEqual(expect.arrayContaining([prefix+'/',prefix+'/src/',prefix+'/src/inner/',prefix+'/src/inner/hello.txt',prefix+'/empty/']))
   expect(zip.total).toBeGreaterThan(5)
   const duplicate=await tree.expandZip([id,src.id,file.id])
   expect(duplicate.entries.filter(x=>x.name===prefix+'/src/inner/hello.txt')).toHaveLength(1)
   tree.removeRoot(id);roots.delete(id)
   await expect(tree.resolve(file.id)).rejects.toThrow()
  }finally{rmSync(temp,{recursive:true,force:true})}
 })
 it('拒绝对根目录之外的节点构造路径，目录内 Junction 不跟随',async()=>{
  const base=mkdtempSync(path.join(os.tmpdir(),'tooldock-root-test-'))
  try{
   const folder=path.join(base,'shared'),outside=path.join(base,'outside')
   mkdirSync(folder);mkdirSync(outside);writeFileSync(path.join(outside,'secret.txt'),'secret')
   let linked=false
   try{symlinkSync(outside,path.join(folder,'link'),'junction');linked=true}catch{/* permissions differ across Windows hosts */}
   const id=randomUUID(),roots=new Map([[id,{id,file:folder,name:'shared',kind:'directory' as const}]])
   const tree=new SharedTree(()=>roots)
   const items=(await tree.list(id)).items
   if(linked)expect(items.some(x=>x.name==='link')).toBe(false)
   expect(JSON.stringify(items)).not.toContain('secret.txt')
  }finally{rmSync(base,{recursive:true,force:true})}
 })
})
