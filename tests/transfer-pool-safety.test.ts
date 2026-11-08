import {describe,expect,it} from 'vitest'
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs'
import {promises as fs} from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {Readable} from 'node:stream'
import type {IncomingMessage} from 'node:http'
import {FilePool} from '../electron/main/services/transfer/pool'
import {MessagePool} from '../electron/main/services/transfer/messages'

describe('文件池最终安全检查',()=>{
 it('同名文件自动生成唯一 ZIP 路径，文件实体保持独立',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'tooldock-safe-pool-'))
  const pool=new FilePool(()=>{});await pool.open(root)
  try{
   const a=path.join(root,'upload-a.part'),b=path.join(root,'upload-b.part')
   writeFileSync(a,'one');writeFileSync(b,'two')
   const src={deviceId:'a',deviceName:'设备 A'}
   await pool.publish(a,'same.txt',3,src)
   await pool.publish(b,'same.txt',3,src)
   expect(pool.list().items.map(i=>i.name)).toEqual(['same.txt','same.txt'])
   expect(pool.entries(pool.rootIds()).map(i=>i.name)).toEqual(['same.txt','same (1).txt'])
   expect(pool.usedBytes).toBe(6)
   const response=await pool.addLocal([root],async()=>()=>{})
   expect(response.added).toBe(0)
   expect(response.errors.join('')).toContain('不能将文件池自身')
  }finally{await pool.close();rmSync(root,{recursive:true,force:true})}
 })
 it('清空过程中并发发布不得生成清空后的幽灵文件',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'tooldock-safe-race-'))
  const pool=new FilePool(()=>{});await pool.open(root)
  try{
   const source=path.join(root,'pending.part');writeFileSync(source,'test')
   const op=pool.publish(source,'test.txt',4,{deviceId:'x',deviceName:'手机'})
   await pool.clear()
   await Promise.allSettled([op])
   expect(pool.itemCount).toBe(0)
   expect(pool.usedBytes).toBe(0)
  }finally{await pool.close();rmSync(root,{recursive:true,force:true})}
 })
})

describe('消息池最终安全检查',()=>{
 it('分块 UTF-8 emoji 不被截断，2000 字符阈值以 Unicode 码点计数',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'tooldock-safe-utf8-'))
  const pool=new MessagePool(()=>{});await pool.open(root)
  try{
   const bytes=Buffer.from('🍀'.repeat(2001))
   const source=Readable.from([bytes.subarray(0,1),bytes.subarray(1,502),bytes.subarray(502)]) as IncomingMessage
   const item=await pool.publish(source,{deviceId:'y',deviceName:'手机'})
   expect(pool.get(item.id).charCount).toBe(2001)
   expect(pool.get(item.id).kind).toBe('file')
   expect(await pool.text(item.id)).toBe('🍀'.repeat(2001))
  }finally{await pool.close();rmSync(root,{recursive:true,force:true})}
 })
 it('清空消息池取消写入中的消息',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'tooldock-safe-message-'))
  const pool=new MessagePool(()=>{});await pool.open(root)
  let resume=()=>{}
  try{
   const gate=new Promise<void>(resolve=>{resume=resolve})
   const source=Readable.from((async function*(){yield Buffer.from('abc');await gate;yield Buffer.from('def')})()) as IncomingMessage
   const operation=pool.publish(source,{deviceId:'y',deviceName:'手机'})
   await pool.clear();resume()
   await expect(operation).rejects.toThrow(/清空|取消/)
   expect(pool.list().total).toBe(0)
  }finally{resume();await pool.close();rmSync(root,{recursive:true,force:true})}
 })
})
