import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
vi.mock('electron',()=>({app:{getPath:()=>process.env.TOOLDOCK_TEST_USERDATA||''}}))
import {initStore,closeStore,getDb,listCategories,listTools,removeCategory,saveTool} from '../electron/main/database/store'
import {createCodecPipeline,duplicateCodecPipeline,getCodecPipeline,listCodecPipelines,removeCodecPipeline,updateCodecPipeline} from '../electron/main/database/codec-pipelines'
import {makeStep} from '../src/shared/codecModels'
let dir=''
beforeEach(()=>{dir=mkdtempSync(path.join(tmpdir(),'tooldock-codec-'));process.env.TOOLDOCK_TEST_USERDATA=dir;initStore()})
afterEach(()=>{closeStore();delete process.env.TOOLDOCK_TEST_USERDATA;rmSync(dir,{recursive:true,force:true})})
const sample=()=>({name:'接口 Token',description:'不保存敏感文本',steps:[makeStep('base64','decode'),makeStep('url','decode')]})
describe('SQLite v8 编解码工具与多流程持久化',()=>{
 it('初次注册工具，迁移幂等且能修改图标/名称/类别/显隐',()=>{
  const id='builtin-codec-tool',item=listTools().find(x=>x.id===id)!
  expect(item).toMatchObject({target:'codec-tool',categoryId:'developer',isBuiltin:true})
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=8').get()).toBeTruthy()
  saveTool({...item,name:'自定义编解码',icon:'heart',categoryId:'default',visible:false})
  closeStore();initStore()
  expect(listTools().filter(x=>x.id===id)).toHaveLength(1)
  expect(listTools().find(x=>x.id===id)).toMatchObject({name:'自定义编解码',icon:'heart',visible:false,categoryId:'default'})
 })
 it('删除 developer 分类后升级不会复活它',()=>{
  removeCategory('developer');getDb().prepare("DELETE FROM tools WHERE id='builtin-codec-tool'").run()
  getDb().prepare('DELETE FROM schema_migrations WHERE version=8').run()
  closeStore();initStore()
  expect(listCategories().find(x=>x.id==='developer')).toBeUndefined()
  expect(listTools().find(x=>x.id==='builtin-codec-tool')?.categoryId).toBe('default')
 })
 it('固定 ID 冲突安全失败且不会标记迁移',()=>{
  getDb().prepare('DELETE FROM schema_migrations WHERE version=8').run()
  getDb().prepare("UPDATE tools SET target='malicious' WHERE id='builtin-codec-tool'").run()
  closeStore();expect(()=>initStore()).toThrow('编解码内置 ID 存在冲突')
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=8').get()).toBeUndefined()
 })
 it('多份同名配置保存、重启加载、CAS 冲突、复制、删除',()=>{
  const first=createCodecPipeline(getDb(),sample())
  const second=createCodecPipeline(getDb(),sample())
  expect(first.id).not.toBe(second.id)
  expect(listCodecPipelines(getDb())).toHaveLength(2)
  const updated=updateCodecPipeline(getDb(),first.id,first.revision,{...sample(),name:'重命名'})
  expect(updated.revision).toBe(2)
  expect(()=>updateCodecPipeline(getDb(),first.id,first.revision,sample())).toThrow()
  const duplicate=duplicateCodecPipeline(getDb(),updated.id)
  expect(duplicate.id).not.toBe(updated.id);expect(duplicate.steps[0].id).not.toBe(updated.steps[0].id)
  closeStore();initStore()
  expect(getCodecPipeline(getDb(),first.id).name).toBe('重命名')
  expect(getCodecPipeline(getDb(),second.id).name).toBe('接口 Token')
  removeCodecPipeline(getDb(),second.id,second.revision)
  expect(()=>getCodecPipeline(getDb(),second.id)).toThrow()
 })
 it('拒绝任意注入输入或输出等敏感字段与非法步骤',()=>{
  expect(()=>createCodecPipeline(getDb(),{...sample(),input:'DO NOT SAVE'} as never)).toThrow()
  expect(()=>createCodecPipeline(getDb(),{name:'',description:'',steps:[]})).toThrow()
  expect(()=>createCodecPipeline(getDb(),{...sample(),steps:[{...makeStep('hex'),options:{value:'bad'} as never}]})).toThrow()
  const x=createCodecPipeline(getDb(),sample())
  const text=JSON.stringify(getDb().prepare('SELECT * FROM codec_pipelines WHERE id=?').get(x.id))
  expect(text).not.toContain('DO NOT SAVE')
  expect(text).not.toContain('input')
  expect(text).not.toContain('output')
 })
})

describe('SQLite v8 流程上限与恢复完整性',()=>{
 it('最多 200 份配置，超限时不删除旧记录',()=>{
  for(let i=0;i<200;i++)createCodecPipeline(getDb(),{...sample(),name:'流程 '+i})
  expect(listCodecPipelines(getDb())).toHaveLength(200)
  expect(()=>createCodecPipeline(getDb(),sample())).toThrow('200')
  expect(listCodecPipelines(getDb())).toHaveLength(200)
 })
 it('数据库备份携带多份静态配置',async()=>{
  const saved=createCodecPipeline(getDb(),sample())
  const snapshot=path.join(dir,'backup.sqlite')
  await getDb().backup(snapshot)
  const Database=(await import('../electron/main/database/sqlite')).default
  const copy=new Database(snapshot,{readonly:true})
  try{
   const row=copy.prepare('SELECT name,steps_json FROM codec_pipelines WHERE id=?').get(saved.id) as {name:string;steps_json:string}
   expect(row.name).toBe('接口 Token')
   expect(JSON.parse(row.steps_json)).toHaveLength(2)
   expect(JSON.stringify(row)).not.toContain('DO-NOT-SAVE-INPUT')
  }finally{copy.close()}
 })
 it('已有异常同名表时拒绝迁移，不写入不完整 v8 标记',()=>{
  getDb().prepare('DELETE FROM schema_migrations WHERE version=8').run()
  getDb().exec('DROP TABLE codec_pipelines')
  getDb().exec('CREATE TABLE codec_pipelines (fake TEXT)')
  closeStore()
  expect(()=>initStore()).toThrow('编解码流程表结构存在冲突')
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=8').get()).toBeUndefined()
 })
})
