import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import fs from 'node:fs'
import {spawn} from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
vi.mock('electron',()=>({app:{getPath:()=>process.env.TOOLDOCK_TEST_USERDATA||'',getAppMetrics:()=>[]}}))
import {initStore,closeStore,getDb,listCategories,listTools,removeCategory,saveTool} from '../electron/main/database/store'
import {previewJunction,createJunction,isValidJunctionName} from '../electron/main/services/command-junction'
import {normalizePortRows,queryPort,terminatePortProcess} from '../electron/main/services/command-port'
import {junctionSchema,killSchema,portSchema} from '../src/shared/commandModels'

let dir=''
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'tooldock-command-'));process.env.TOOLDOCK_TEST_USERDATA=dir;initStore()})
afterEach(()=>{closeStore();delete process.env.TOOLDOCK_TEST_USERDATA;fs.rmSync(dir,{recursive:true,force:true})})

describe('命令执行工具 SQLite v9 增量注册',()=>{
 it('幂等注册、工具不可删除，保留用户自定义名称图标位置与隐藏状态',()=>{
  const id='builtin-command-tool'
  const original=listTools().find(t=>t.id===id)!
  expect(original).toMatchObject({categoryId:'developer',target:'command-tool',isBuiltin:true})
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=9').get()).toBeTruthy()
  saveTool({...original,name:'我常用的命令',icon:'heart',categoryId:'default',visible:false})
  closeStore();initStore()
  const saved=listTools().filter(t=>t.id===id)
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({name:'我常用的命令',icon:'heart',categoryId:'default',visible:false})
  expect(getDb().prepare("SELECT name FROM sqlite_master WHERE name='command_history'").get()).toBeUndefined()
 })
 it('删除 developer 分类后不会在迁移时重建',()=>{
  removeCategory('developer')
  getDb().prepare("DELETE FROM tools WHERE id='builtin-command-tool'").run()
  getDb().prepare('DELETE FROM schema_migrations WHERE version=9').run()
  closeStore();initStore()
  expect(listCategories().find(x=>x.id==='developer')).toBeUndefined()
  expect(listTools().find(x=>x.id==='builtin-command-tool')?.categoryId).toBe('default')
 })
 it('固定工具 ID 冲突中止迁移并保留原数据',()=>{
  getDb().prepare('DELETE FROM schema_migrations WHERE version=9').run()
  getDb().prepare("UPDATE tools SET target='rogue' WHERE id='builtin-command-tool'").run()
  closeStore()
  expect(()=>initStore()).toThrow('命令执行内置 ID 存在冲突')
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=9').get()).toBeUndefined()
 })
})

describe('端口和进程安全边界',()=>{
 it('限定端口 1–65535 与固定结构的结束输入',()=>{
  for(const x of [1,80,65535])expect(portSchema.parse(x)).toBe(x)
  for(const x of [0,-1,65536,1.5,'8080'])expect(()=>portSchema.parse(x)).toThrow()
  const valid={port:8080,pid:1234,name:'node',startedAt:'2026-10-31T01:12:00.0000000Z'}
  expect(killSchema.parse(valid)).toEqual(valid)
  expect(()=>killSchema.parse({...valid,script:'Remove-Item C:\\'})).toThrow()
  expect(()=>killSchema.parse({...valid,startedAt:'abc; Stop-Process'})).toThrow()
 })
 it('空结果、TCP/UDP 多条、系统进程保护及异常结果解析',()=>{
  expect(normalizePortRows([],8080)).toEqual([])
  const raw=[
   {protocol:'TCP',localAddress:'127.0.0.1',localPort:8080,remoteAddress:'127.0.0.1',remotePort:55977,state:'Listen',pid:5012,name:'node',startedAt:'2026-10-31T01:12:00.0000000Z',executablePath:'C:\\node.exe'},
   {protocol:'UDP',localAddress:'::',localPort:8080,remoteAddress:null,remotePort:null,pid:1,name:'System',startedAt:'2026-10-31T01:12:00.0000000Z'},
   {protocol:'TCP',localAddress:'::1',localPort:8080,remoteAddress:null,remotePort:0,state:'Listen',pid:5013,name:null,startedAt:null}
  ]
  const result=normalizePortRows(raw,8080)
  expect(result).toHaveLength(3)
  expect(result[0]).toMatchObject({family:'IPv4',protocol:'TCP',canTerminate:true})
  expect(result[1]).toMatchObject({family:'IPv6',protocol:'UDP',canTerminate:false})
  expect(result[2].blockReason).toContain('启动时间')
  expect(()=>normalizePortRows([{...raw[0],localPort:9999}],8080)).toThrow()
 })
 it('非法端口在调用系统命令前即拒绝',async()=>{
  await expect(queryPort(0)).rejects.toThrow()
  await expect(queryPort(65536)).rejects.toThrow()
 })
 it.skipIf(process.platform!=='win32')('真实 PowerShell 端口查询能返回结构化结果（不修改进程）',async()=>{
  const data=await queryPort(135)
  expect(data.port).toBe(135)
  expect(Array.isArray(data.rows)).toBe(true)
  expect(data.durationMs).toBeGreaterThanOrEqual(0)
 },30000)
 it.skipIf(process.platform!=='win32')('只结束本测试创建的临时端口进程（PID/启动时间/端口一致）',async()=>{
  const code="const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>process.stdout.write(String(s.address().port)+'\\n'))"
  const child=spawn(process.execPath,['-e',code],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  try{
   const port=await new Promise<number>((resolve,reject)=>{
    child.on('error',reject)
    child.stdout!.once('data',data=>{
     const value=Number(String(data).trim())
     if(Number.isInteger(value)&&value>0)resolve(value)
     else reject(Error('测试进程没有返回监听端口'))
    })
    child.once('exit',()=>reject(Error('测试进程提前退出')))
   })
   const info=await queryPort(port)
   const owner=info.rows.find(x=>x.pid===child.pid)
   expect(owner).toBeDefined()
   expect(owner?.canTerminate).toBe(true)
   const done=await terminatePortProcess({port,pid:child.pid!,name:owner!.name!,startedAt:owner!.startedAt!})
   expect(done.pid).toBe(child.pid)
   await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',()=>resolve())})
   expect(child.exitCode).not.toBeNull()
  }finally{if(child.exitCode===null)child.kill()}
 },30000)
})

describe('Junction 目录链接预检查',()=>{
 it('严格拒绝非法链接名称及非法入参',()=>{
  for(const x of ['CON','LPT1','.', '..','abc ','a/b','a\\b','NUL.txt'])expect(isValidJunctionName(x)).toBe(false)
  expect(isValidJunctionName('shared-library')).toBe(true)
  expect(()=>junctionSchema.parse({target:'X',parent:'Y',name:'A',shell:'cmd'})).toThrow()
 })
 it.skipIf(process.platform!=='win32')('验证现有文件夹、路径冲突与避免循环',()=>{
  const target=path.join(dir,'source')
  const parent=path.join(dir,'parent')
  fs.mkdirSync(target);fs.mkdirSync(parent)
  const input={target,parent,name:'Linked'}
  expect(previewJunction(input)).toMatchObject({valid:true,reason:null})
  expect(previewJunction({...input,target:target+'\\',parent:parent+'\\'})).toMatchObject({valid:true})
  fs.mkdirSync(path.join(parent,'Linked'))
  expect(previewJunction(input)).toMatchObject({valid:false})
  expect(previewJunction({...input,name:'Another',target:path.join(dir,'missing')})).toMatchObject({valid:false})
  expect(previewJunction({...input,name:'Nested',parent:target}).reason).toContain('循环')
  expect(previewJunction({...input,target:'\\\\server\\share'})).toMatchObject({valid:false})
 })
 it.skipIf(process.platform!=='win32')('在独立临时目录真实创建 Junction 并校验映射与原目录不受影响',()=>{
  const target=path.join(dir,'original')
  const parent=path.join(dir,'links')
  const link=path.join(parent,'shared')
  fs.mkdirSync(target);fs.mkdirSync(parent)
  fs.writeFileSync(path.join(target,'marker.txt'),'safe')
  const result=createJunction({target,parent,name:'shared'})
  expect(result.linkPath.toLowerCase()).toBe(link.toLowerCase())
  expect(fs.readFileSync(path.join(link,'marker.txt'),'utf8')).toBe('safe')
  fs.rmdirSync(link)
  expect(fs.existsSync(link)).toBe(false)
  expect(fs.readFileSync(path.join(target,'marker.txt'),'utf8')).toBe('safe')
 })
})
