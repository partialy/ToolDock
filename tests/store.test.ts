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
    expect(listCategories().map(c => c.id)).toEqual(['default', 'developer'])
    expect(listTools().find(t => t.id === 'builtin-key-generator')?.categoryId).toBe('developer')
    removeCategory('developer')
    expect(listTools().find(t => t.id === 'builtin-key-generator')?.categoryId).toBe('default')
    closeStore()
    initStore()
    expect(listCategories().map(c => c.id)).toEqual(['default'])
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
  expect(listTools().filter(x=>x.isBuiltin).map(x=>x.id).sort()).toEqual(['builtin-json-tool','builtin-key-generator'])
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
  expect(listCategories().map(x=>x.id)).toEqual(['default'])
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
