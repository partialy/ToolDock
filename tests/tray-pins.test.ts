import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

vi.mock('electron',()=>({app:{getPath:()=>process.env.TOOLDOCK_TEST_USERDATA||''}}))
import {initStore,closeStore,listTools,getDb,pinTool,reorderPinnedTools,getPinnedTools,saveTool,removeTool,saveCategory} from '../electron/main/database/store'
let root=''
beforeEach(()=>{root=mkdtempSync(path.join(tmpdir(),'tooldock-pin-'));process.env.TOOLDOCK_TEST_USERDATA=root;initStore()})
afterEach(()=>{closeStore();delete process.env.TOOLDOCK_TEST_USERDATA;rmSync(root,{recursive:true,force:true})})

describe('v13 托盘工具固定',()=>{
 it('初始化迁移且不覆盖名称、类别、可见性',()=>{
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=13').get()).toBeTruthy()
  const t=listTools()[0];saveTool({...t,name:'更名',visible:false})
  pinTool(t.id,true);closeStore();initStore()
  expect(listTools().find(v=>v.id===t.id)).toMatchObject({name:'更名',visible:false,trayPinOrder:0})
 })
 it('最多六个、失败不改变顺序、重新固定追加到末尾',()=>{
  const tools=listTools().slice(0,7)
  tools.slice(0,6).forEach(t=>pinTool(t.id,true))
  expect(()=>pinTool(tools[6].id,true)).toThrow('最多固定 6')
  expect(getPinnedTools().map(t=>t.id)).toEqual(tools.slice(0,6).map(t=>t.id))
  pinTool(tools[1].id,false)
  pinTool(tools[6].id,true)
  expect(getPinnedTools().map(t=>t.trayPinOrder)).toEqual([0,1,2,3,4,5])
  expect(getPinnedTools().at(-1)?.id).toBe(tools[6].id)
 })
 it('固定集合必须完整且排序唯一，隐藏项占用名额',()=>{
  const tools=listTools().slice(0,3)
  tools.forEach(t=>pinTool(t.id,true))
  expect(()=>reorderPinnedTools([tools[1].id,tools[1].id,tools[0].id])).toThrow()
  expect(()=>reorderPinnedTools([tools[0].id])).toThrow()
  reorderPinnedTools([tools[2].id,tools[0].id,tools[1].id])
  saveTool({...tools[0],visible:false})
  expect(getPinnedTools().map(t=>t.id)).toEqual([tools[2].id,tools[0].id,tools[1].id])
  expect(getPinnedTools(true).map(t=>t.id)).toEqual([tools[2].id,tools[1].id])
 })
 it('删除网页工具释放位置、隐藏分类只影响托盘显示',()=>{
  const x=saveTool({name:'临时网页',type:'link',target:'https://example.com',categoryId:'default'})
  const y=saveTool({name:'常用网页',type:'link',target:'https://example.org',categoryId:'default'})
  pinTool(x.id,true);pinTool(y.id,true)
  saveCategory({id:'default',name:'默认分类',visible:false})
  expect(getPinnedTools(true)).toEqual([])
  expect(getPinnedTools()).toHaveLength(2)
  removeTool(x.id)
  expect(getPinnedTools().map(t=>t.trayPinOrder)).toEqual([0])
 })
})
