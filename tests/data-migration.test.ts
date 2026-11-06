import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type {BrowserWindow} from 'electron'

vi.mock('electron',()=>({app:{getPath:(name:string)=>path.join(process.env.TOOLDOCK_MIGRATION_TEST!,name==='userData'?'userdata':'temp'),getAppPath:()=>path.join(process.env.TOOLDOCK_MIGRATION_TEST!,'application')},dialog:{},shell:{}}))
vi.mock('../electron/main/views/webviews',()=>({prepareWebviewsForDataMove:vi.fn(async()=>{})}))
import * as store from '../electron/main/database/store'
import {initMarker,migrateData} from '../electron/main/services/data'
import {prepareDataMigration} from '../electron/main/services/data-migration'

let root='',old='',target=''
const win={} as BrowserWindow
beforeEach(()=>{
 fs.mkdirSync(path.resolve('plans'),{recursive:true});root=fs.mkdtempSync(path.resolve('plans/data-migration-test-'));process.env.TOOLDOCK_MIGRATION_TEST=root
 fs.mkdirSync(path.join(root,'userdata'));store.initStore();initMarker();old=store.getDataRoot();target=path.join(root,'destination');fs.mkdirSync(target)
 fs.writeFileSync(path.join(old,'keep.txt'),'source remains')
})
afterEach(()=>{vi.restoreAllMocks();store.closeStore();delete process.env.TOOLDOCK_MIGRATION_TEST;fs.rmSync(root,{recursive:true,force:true})})
function stages(){return fs.readdirSync(root).filter(name=>name.startsWith('.tooldock-migrate-'))}
describe('数据目录迁移与目标保留',()=>{
 it('迁移到用户预建的空目录，验证后切换定位且保留原目录',async()=>{
  const before=fs.statSync(target)
  await expect(migrateData(win,target)).resolves.toEqual({restartRequired:true})
  expect(store.getDataRoot()).toBe(target);expect(store.getBoot().dataRoot).toBe(target)
  expect(fs.statSync(target).ino).toBe(before.ino)
  expect(fs.readFileSync(path.join(old,'keep.txt'),'utf8')).toBe('source remains')
  expect(fs.readFileSync(path.join(target,'keep.txt'),'utf8')).toBe('source remains')
  expect(store.getDb().pragma('integrity_check',{simple:true})).toBe('ok');expect(stages()).toEqual([])
 })
 it('拒绝非空目标，不改动用户文件或启动定位',async()=>{
  fs.writeFileSync(path.join(target,'personal.txt'),'do not remove')
  await expect(migrateData(win,target)).rejects.toThrow('目标目录必须为空')
  expect(fs.readFileSync(path.join(target,'personal.txt'),'utf8')).toBe('do not remove')
  expect(store.getDataRoot()).toBe(old);expect(stages()).toEqual([])
 })
 it('排他提交途中失败时保留目标和用户新写文件，重新打开原数据库',async()=>{
  const original=fs.copyFileSync
  vi.spyOn(fs,'copyFileSync').mockImplementation((input,output,mode)=>{
   if(path.dirname(String(output))===target){fs.writeFileSync(path.join(target,'user-created.txt'),'concurrent content');throw Error('模拟复制失败')}
   return original(input,output,mode)
  })
  await expect(migrateData(win,target)).rejects.toThrow('模拟复制失败')
  expect(fs.readFileSync(path.join(target,'user-created.txt'),'utf8')).toBe('concurrent content')
  expect(fs.readFileSync(path.join(old,'keep.txt'),'utf8')).toBe('source remains')
  expect(store.getDataRoot()).toBe(old);expect(store.getDb().pragma('integrity_check',{simple:true})).toBe('ok')
  expect(store.getDb().prepare('SELECT count(*) AS n FROM migration_history').get()?.n).toBe(0);expect(stages()).toEqual([])
 })
 it('目标在暂存期间变为非空时终止提交并保留新增内容',()=>{
  const migration=prepareDataMigration(old,target)
  try{migration.copy();fs.writeFileSync(path.join(target,'new.txt'),'new');expect(()=>migration.publish()).toThrow('目标目录已写入其他内容');expect(fs.readFileSync(path.join(target,'new.txt'),'utf8')).toBe('new')}
  finally{migration.cleanup()}
 })
 it('新数据库打开失败时原子恢复启动定位并保留目标副本',async()=>{
  const actualInit=store.initStore
  vi.spyOn(store,'initStore').mockImplementationOnce(()=>{fs.writeFileSync(path.join(target,'after-copy.txt'),'user write after copy');throw Error('模拟目标数据库打开失败')}).mockImplementation(actualInit)
  await expect(migrateData(win,target)).rejects.toThrow('模拟目标数据库打开失败')
  expect(store.getBoot().dataRoot).toBe(old);expect(store.getDataRoot()).toBe(old)
  expect(fs.readFileSync(path.join(target,'after-copy.txt'),'utf8')).toBe('user write after copy')
  expect(fs.readFileSync(path.join(target,'keep.txt'),'utf8')).toBe('source remains')
  expect(store.getDb().pragma('integrity_check',{simple:true})).toBe('ok');expect(stages()).toEqual([])
 })
 it('仅暂存清理失败时不将已成功迁移误报为失败',async()=>{
  const original=fs.rmSync
  vi.spyOn(fs,'rmSync').mockImplementation((file,options)=>{if(path.basename(String(file)).startsWith('.tooldock-migrate-'))throw Error('模拟暂存清理被占用');return original(file,options)})
  await expect(migrateData(win,target)).resolves.toEqual({restartRequired:true})
  expect(store.getDataRoot()).toBe(target);expect(store.getBoot().dataRoot).toBe(target)
  expect(store.getDb().pragma('integrity_check',{simple:true})).toBe('ok');expect(stages()).toHaveLength(1)
  expect(fs.readFileSync(path.join(old,'keep.txt'),'utf8')).toBe('source remains')
 })
 it('拒绝目标链接及通过父链接进入原数据目录的路径',async()=>{
  const alias=path.join(root,'alias');fs.symlinkSync(old,alias,'junction')
  await expect(migrateData(win,alias)).rejects.toThrow('符号链接或 Junction')
  await expect(migrateData(win,path.join(alias,'nested'))).rejects.toThrow('符号链接或 Junction')
  expect(fs.readFileSync(path.join(old,'keep.txt'),'utf8')).toBe('source remains');expect(stages()).toEqual([])
 })
 it('原目录内包含链接时停止复制，不影响链接指向的文件',async()=>{
  const outside=path.join(root,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'personal.txt'),'private')
  fs.symlinkSync(outside,path.join(old,'external-link'),'junction')
  await expect(migrateData(win,target)).rejects.toThrow('符号链接或特殊文件')
  expect(fs.readFileSync(path.join(outside,'personal.txt'),'utf8')).toBe('private')
  expect(fs.readdirSync(target)).toEqual([]);expect(store.getDataRoot()).toBe(old);expect(stages()).toEqual([])
 })
})
