import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.TOOLDOCK_TEST_USERDATA ?? '' }
}))

import {
  initStore, closeStore, listCategories, listTools,
  removeCategory, saveCategory, saveTool, removeTool, getSettings, putSetting, getDb,
} from '../electron/main/database/store'

let workdir = ''
beforeEach(() => {
  workdir = mkdtempSync(path.join(tmpdir(), 'tooldock-db-test-'))
  process.env.TOOLDOCK_TEST_USERDATA = workdir
  initStore()
})
afterEach(() => {
  closeStore()
  delete process.env.TOOLDOCK_TEST_USERDATA
  rmSync(workdir, { recursive: true, force: true })
})

describe('分类与 SQLite 持久化', () => {
  it('首次启动有预置工具，删除非空分类后迁移到默认分类且重启不复活', () => {
    expect(listCategories().map(c => c.id)).toEqual(['default', 'developer', 'images', 'files'])
    expect(listTools().find(t => t.id === 'builtin-key-generator')?.categoryId).toBe('developer')
    removeCategory('developer')
    expect(listTools().find(t => t.id === 'builtin-key-generator')?.categoryId).toBe('default')
    closeStore()
    initStore()
    expect(listCategories().map(c => c.id)).toEqual(['default', 'images', 'files'])
    expect(listTools().find(t => t.id === 'builtin-key-generator')?.categoryId).toBe('default')
  })
  it('默认分类允许改名和隐藏，但禁止删除', () => {
    saveCategory({ id:'default', name:'收件箱', visible:false, icon:'inbox' })
    expect(listCategories()[0]).toMatchObject({ id:'default', name:'收件箱', visible:false })
    expect(() => removeCategory('default')).toThrow('默认分类不可删除')
    closeStore()
    initStore()
    expect(listCategories()[0]).toMatchObject({ name:'收件箱', visible:false })
  })
  it('新增网页工具、持久化设置，禁止删除内置工具', () => {
    const item = saveTool({ name:'安全网页', categoryId:'default', type:'link', target:'https://example.com' })
    expect(item.type).toBe('link')
    putSetting('theme','light')
    expect(() => removeTool('builtin-key-generator')).toThrow('内置工具')
    closeStore()
    initStore()
    expect(listTools().some(t=>t.id===item.id)).toBe(true)
    expect(getSettings().theme).toBe('light')
    expect(() => saveTool({name:'不支持',categoryId:'default',type:'internal',target:'key-generator'})).toThrow()
  })
})

describe('SQLite v2 JSON 内置工具增量升级', () => {
 it('全新安装注册两个不可删除的内置工具',()=>{
  expect(listTools().filter(x=>x.isBuiltin).map(x=>x.id).sort()).toEqual(['builtin-file-transfer','builtin-image-encoding','builtin-image-processor','builtin-json-tool','builtin-key-generator','builtin-logo-icon-generator','builtin-qr-code-tool','builtin-time-converter','builtin-uuid-generator'])
  expect(()=>removeTool('builtin-json-tool')).toThrow('内置工具')
 })
 it('模拟 v1 升级时保留重命名且隐藏的 developer 分类',()=>{
  saveCategory({id:'developer',name:'我自己的开发工具',visible:false,icon:'braces'})
  getDb().prepare("DELETE FROM tools WHERE id='builtin-json-tool'").run()
  getDb().prepare('DELETE FROM schema_migrations WHERE version=2').run()
  closeStore();initStore()
  expect(listCategories().find(x=>x.id==='developer')).toMatchObject({name:'我自己的开发工具',visible:false,icon:'braces'})
  expect(listTools().find(x=>x.id==='builtin-json-tool')).toMatchObject({categoryId:'developer',isBuiltin:true})
 })
 it('开发工具分类被删后仍新增到默认分类，不复活旧分类',()=>{
  removeCategory('developer')
  getDb().prepare("DELETE FROM tools WHERE id='builtin-json-tool'").run()
  getDb().prepare('DELETE FROM schema_migrations WHERE version=2').run()
  closeStore();initStore()
  expect(listCategories().map(x=>x.id)).toEqual(['default','images','files'])
  expect(listTools().find(x=>x.id==='builtin-json-tool')).toMatchObject({categoryId:'default',isBuiltin:true})
  closeStore();initStore()
  expect(listTools().filter(x=>x.id==='builtin-json-tool')).toHaveLength(1)
 })
 it('保留用户修改过的 JSON 工具，禁止任意内部目标',()=>{
  const item=listTools().find(x=>x.id==='builtin-json-tool')!
  saveTool({...item,name:'我的 JSON',visible:false,icon:'file-text',categoryId:'default'})
  getDb().prepare('DELETE FROM schema_migrations WHERE version=2').run()
  closeStore();initStore()
  expect(listTools().find(x=>x.id==='builtin-json-tool')).toMatchObject({name:'我的 JSON',visible:false,icon:'file-text'})
  expect(()=>saveTool({...item,type:'internal',target:'untrusted'})).toThrow()
  expect(()=>saveTool({name:'伪内置',categoryId:'default',type:'internal',target:'json-tool'})).toThrow()
 })
})


describe('SQLite v3 原生工具增量升级',()=>{
 it('默认注册四个新工具并保护其身份',()=>{
  const ids=['builtin-image-processor','builtin-logo-icon-generator','builtin-time-converter','builtin-uuid-generator']
  for(const id of ids){expect(listTools().find(t=>t.id===id)?.isBuiltin).toBe(true);expect(()=>removeTool(id)).toThrow('内置工具')}
  expect(listCategories().find(c=>c.id==='images')?.name).toBe('图片工具')
  expect(getDb().prepare('SELECT version FROM schema_migrations WHERE version=3').get()).toBeTruthy()
 })
 it('用户删除图片分类后不复活，并保留自定义名称显隐',()=>{
  const old=listTools().find(t=>t.id==='builtin-image-processor')!
  saveTool({...old,name:'我自己的图像工具',visible:false,icon:'heart'})
  removeCategory('images')
  closeStore();initStore()
  expect(listCategories().some(c=>c.id==='images')).toBe(false)
  expect(listTools().find(t=>t.id==='builtin-image-processor')).toMatchObject({categoryId:'default',name:'我自己的图像工具',visible:false,icon:'heart'})
 })
 it('从 v2 数据升级到 v3 时仅增量补齐工具',()=>{
  const ids=['builtin-image-processor','builtin-logo-icon-generator','builtin-time-converter','builtin-uuid-generator']
  for(const id of ids)getDb().prepare('DELETE FROM tools WHERE id=?').run(id)
  getDb().prepare("DELETE FROM tools WHERE id='builtin-image-encoding'").run()
  getDb().prepare("DELETE FROM tools WHERE id='builtin-qr-code-tool'").run()
  getDb().prepare('DELETE FROM schema_migrations WHERE version=5').run()
  getDb().prepare('DELETE FROM schema_migrations WHERE version=4').run()
  getDb().prepare("DELETE FROM categories WHERE id='images'").run()
  getDb().prepare('DELETE FROM schema_migrations WHERE version=3').run()
  saveCategory({id:'developer',name:'已自定义开发工具',visible:false})
  closeStore();initStore()
  expect(listCategories().find(x=>x.id==='developer')).toMatchObject({name:'已自定义开发工具',visible:false})
  expect(listTools().filter(t=>ids.includes(t.id))).toHaveLength(4)
  closeStore();initStore()
  expect(listTools().filter(t=>ids.includes(t.id))).toHaveLength(4)
 })
})


describe('SQLite v4 图片编码工具增量升级',()=>{
 const id='builtin-image-encoding'
 it('注册新内置工具且不可删除',()=>{
  expect(listTools().find(t=>t.id===id)).toMatchObject({categoryId:'images',target:'image-encoding',isBuiltin:true})
  expect(()=>removeTool(id)).toThrow('内置工具')
  expect(getDb().prepare('SELECT version FROM schema_migrations WHERE version=4').get()).toBeTruthy()
 })
 it('删除图片工具分类后升级只回退默认分类，不复活图片分类',()=>{
  removeCategory('images')
  getDb().prepare('DELETE FROM tools WHERE id=?').run(id)
  getDb().prepare('DELETE FROM schema_migrations WHERE version=4').run()
  closeStore();initStore()
  expect(listCategories().some(c=>c.id==='images')).toBe(false)
  expect(listTools().find(t=>t.id===id)).toMatchObject({categoryId:'default',isBuiltin:true})
 })
 it('重复启动保留用户自定义工具名/显隐/位置，不产生重复',()=>{
  const existing=listTools().find(t=>t.id===id)!
  saveTool({...existing,name:'自己的图片编码',visible:false,icon:'heart',categoryId:'default'})
  closeStore();initStore()
  expect(listTools().filter(t=>t.id===id)).toHaveLength(1)
  expect(listTools().find(t=>t.id===id)).toMatchObject({name:'自己的图片编码',visible:false,icon:'heart',categoryId:'default'})
 })
 it('模拟 v3 升级，并验证内置 ID 冲突时迁移回滚',()=>{
  getDb().prepare('DELETE FROM tools WHERE id=?').run(id)
  getDb().prepare('DELETE FROM schema_migrations WHERE version=4').run()
  closeStore();initStore()
  expect(listTools().filter(t=>t.id===id)).toHaveLength(1)
  getDb().prepare("UPDATE tools SET target='unsafe' WHERE id=?").run(id)
  getDb().prepare('DELETE FROM schema_migrations WHERE version=4').run()
  closeStore()
  expect(()=>initStore()).toThrow('图片编码内置工具 ID 冲突')
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=4').get()).toBeUndefined()
 })
})

describe('SQLite v5 二维码工具安全迁移',()=>{
 const id='builtin-qr-code-tool'
 it('新装包含内置二维码工具，不能被用户删除',()=>{
  expect(listTools().find(x=>x.id===id)).toMatchObject({categoryId:'images',target:'qr-code-tool',isBuiltin:true})
  expect(getDb().prepare('SELECT version FROM schema_migrations WHERE version=5').get()).toBeTruthy()
  expect(()=>removeTool(id)).toThrow('内置工具')
 })
 it('用户删除 images 后，v5 升级不能复活原分类',()=>{
  removeCategory('images')
  getDb().prepare('DELETE FROM tools WHERE id=?').run(id)
  getDb().prepare('DELETE FROM schema_migrations WHERE version=5').run()
  closeStore();initStore()
  expect(listCategories().some(x=>x.id==='images')).toBe(false)
  expect(listTools().find(x=>x.id===id)).toMatchObject({categoryId:'default'})
 })
 it('重启保留用户重命名、隐藏与图标选择',()=>{
  const old=listTools().find(x=>x.id===id)!
  saveTool({...old,name:'我专属的 QR',visible:false,icon:'star',categoryId:'default'})
  closeStore();initStore()
  expect(listTools().filter(x=>x.id===id)).toHaveLength(1)
  expect(listTools().find(x=>x.id===id)).toMatchObject({name:'我专属的 QR',visible:false,icon:'star',categoryId:'default'})
 })
 it('存在伪造内置身份时整次迁移回滚',()=>{
  getDb().prepare('DELETE FROM schema_migrations WHERE version=5').run()
  getDb().prepare("UPDATE tools SET target='invalid-target' WHERE id=?").run(id)
  closeStore();expect(()=>initStore()).toThrow('固定 ID 存在冲突')
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=5').get()).toBeUndefined()
 })
})

describe('SQLite v6 文件快传与通知设置',()=>{
 const id='builtin-file-transfer'
 it('全新数据库新增内置工具、文件分类与默认右下角',()=>{
  expect(listCategories().find(x=>x.id==='files')?.name).toBe('文件工具')
  expect(listTools().find(x=>x.id===id)).toMatchObject({target:'file-transfer',isBuiltin:true,categoryId:'files'})
  expect(getSettings().notificationPosition).toBe('bottom-right')
  expect(getSettings().fileTransferPrefs.allowUpload).toBe(false)
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=6').get()).toBeTruthy()
  expect(()=>removeTool(id)).toThrow('内置工具')
 })
 it('删除文件分类后重启不恢复分类，工具移入默认',()=>{
  removeCategory('files');closeStore();initStore()
  expect(listCategories().some(x=>x.id==='files')).toBe(false)
  expect(listTools().find(x=>x.id===id)?.categoryId).toBe('default')
 })
 it('允许修改内置工具显示名与隐藏选项，同时保留设置',()=>{
  const item=listTools().find(x=>x.id===id)!
  saveTool({...item,name:'局域网分享',visible:false,icon:'network'})
  putSetting('notificationPosition','top-left')
  closeStore();initStore()
  expect(listTools().find(x=>x.id===id)).toMatchObject({name:'局域网分享',visible:false,icon:'network'})
  expect(getSettings().notificationPosition).toBe('top-left')
 })
 it('升级时冲突回滚，不生成不完整 v6 标记',()=>{
  getDb().prepare('DELETE FROM schema_migrations WHERE version=6').run()
  getDb().prepare("UPDATE tools SET target='fake-target' WHERE id=?").run(id)
  closeStore()
  expect(()=>initStore()).toThrow('文件快传内置 ID 存在冲突')
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=6').get()).toBeUndefined()
 })
})
