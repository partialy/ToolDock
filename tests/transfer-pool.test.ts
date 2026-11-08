import {describe,it,expect} from 'vitest'
import {mkdtempSync,writeFileSync,mkdirSync,existsSync,readFileSync,rmSync} from 'node:fs'
import {Readable} from 'node:stream'
import type {IncomingMessage} from 'node:http'
import path from 'node:path'
import os from 'node:os'
import {FilePool} from '../electron/main/services/transfer/pool'
import {MessagePool} from '../electron/main/services/transfer/messages'

describe('共享文件池 - 存储与生命周期',()=>{
 it('复制本地文件与目录，不改变原文件；文件池清理时只删除副本',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-pool-test-'))
  const src=path.join(temp,'original'),session=path.join(temp,'session')
  mkdirSync(src);mkdirSync(session)
  mkdirSync(path.join(src,'nested'))
  writeFileSync(path.join(src,'nested','a.txt'),'hello')
  writeFileSync(path.join(src,'empty.txt'),'')
  const pool=new FilePool(()=>{})
  await pool.open(session)
  try{
   const result=await pool.addLocal([src],async()=>()=>{})
   expect(result.errors).toEqual([])
   expect(result.added).toBe(2)
   const root=pool.list()
   expect(root.items).toHaveLength(1)
   const dir=pool.list(root.items[0].id)
   expect(dir.items.some(x=>x.name==='nested')).toBe(true)
   const inner=pool.list(dir.items.find(x=>x.name==='nested')!.id)
   const item=pool.file(inner.items[0].id)
   expect(readFileSync(item.file,'utf8')).toBe('hello')
   expect(pool.usedBytes).toBe(5)
   await pool.remove([root.items[0].id])
   expect(pool.itemCount).toBe(0)
   expect(existsSync(path.join(src,'nested','a.txt'))).toBe(true)
  }finally{await pool.close();rmSync(temp,{force:true,recursive:true})}
 })
 it('允许同名文件共存，ZIP 来源保持不透明 ID',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-pool-duplicate-'))
  const session=path.join(temp,'session');mkdirSync(session)
  const sourceA=path.join(temp,'a.txt'),sourceB=path.join(temp,'b.txt')
  writeFileSync(sourceA,'a');writeFileSync(sourceB,'b')
  const pool=new FilePool(()=>{});await pool.open(session)
  try{
   await pool.addLocal([sourceA,sourceB],async()=>()=>{})
   const ids=pool.rootIds()
   expect(ids).toHaveLength(2)
   expect(pool.entries(ids)).toHaveLength(2)
  }finally{await pool.close();rmSync(temp,{force:true,recursive:true})}
 })
})

describe('共享消息池 - 文本内联、文件化与自动淘汰',()=>{
 it('超过 2000 Unicode 字符会文件化，仍支持分块读取和全文搜索',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-messages-test-'))
  const messages=new MessagePool(()=>{});await messages.open(temp)
  try{
   const text='😀'.repeat(2001)+'\nhello world'
   const input=Readable.from([Buffer.from(text)]) as IncomingMessage
   const item=await messages.publish(input,{deviceId:'test',deviceName:'设备A'})
   const list=messages.list()
   expect(list.items[0].kind).toBe('file')
   expect(list.items[0].charCount).toBe(2013)
   expect(await messages.text(item.id)).toBe(text)
   const first=await messages.chunk(item.id)
   expect(first.text).toBe(text)
   expect((await messages.search(item.id,'hello'))[0].snippet).toContain('hello')
   await messages.clear()
   expect(messages.list().total).toBe(0)
  }finally{await messages.close();rmSync(temp,{force:true,recursive:true})}
 })
 it('第 301 条自动淘汰第一条',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-messages-limit-'))
  const messages=new MessagePool(()=>{});await messages.open(temp)
  try{
   let first=''
   for(let i=0;i<301;i++){
    const created=await messages.publish(Readable.from([Buffer.from('message '+i)]) as IncomingMessage,{deviceId:'dev',deviceName:'设备'})
    if(i===0)first=created.id
   }
   expect(messages.list().total).toBe(300)
   expect(messages.list().items).toHaveLength(300)
   expect(()=>messages.get(first)).toThrow()
  }finally{await messages.close();rmSync(temp,{force:true,recursive:true})}
 })
})
