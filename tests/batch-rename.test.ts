import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {mkdir,readdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

vi.mock('electron',()=>({
 app:{getPath:()=>process.env.TOOLDOCK_TEST_USERDATA??''}
}))

import {closeStore,getDb,initStore,listCategories,listTools,removeCategory,saveTool} from '../electron/main/database/store'
import {createRenamePreset,duplicateRenamePreset,listRenamePresets,removeRenamePreset,updateRenamePreset} from '../electron/main/database/rename-presets'
import {BatchRenameService} from '../electron/main/services/batch-rename/batch-rename-service'
import {previewBatchRename,sortRenameEntries} from '../src/lib/batch-rename/rename-engine'
import {defaultExtensionPolicy,makeRenameStep,type RenameFileEntry} from '../src/shared/batchRenameModels'

let workdir=''
beforeEach(()=>{
 workdir=mkdtempSync(path.join(tmpdir(),'tooldock-rename-test-'))
 process.env.TOOLDOCK_TEST_USERDATA=workdir
 initStore()
})
afterEach(()=>{
 closeStore()
 delete process.env.TOOLDOCK_TEST_USERDATA
 rmSync(workdir,{recursive:true,force:true})
})

function makeEntry(name:string,index:number,dir='E:\\demo'):RenameFileEntry{
 const dot=name.lastIndexOf('.')
 const stem=dot>0?name.slice(0,dot):name
 const ext=dot>0?name.slice(dot):''
 return {
  id:`id-${index}`,
  path:`${dir}\\${name}`,
  dir,
  name,
  stem,
  ext,
  size:100+index,
  mtimeMs:new Date(2026,10,25,10,0,0).getTime()+index*1000,
  parentName:'demo'
 }
}

describe('批量重命名规则引擎',()=>{
 it('支持首项跳过序号（file / file(1) / file(2)）及自定义 _{number} 格式',()=>{
  const entries=[makeEntry('a.png',0),makeEntry('b.png',1),makeEntry('c.png',2)]
  const checked=new Set(entries.map(e=>e.id))
  const step=makeRenameStep('template')
  step.options={
   template:'file({number})',
   startNumber:1,
   step:1,
   padWidth:1,
   skipFirstNumber:true,
   firstTemplate:'file',
   dateFormat:'YYYYMMDD'
  }
  const res1=previewBatchRename(entries,checked,[step],defaultExtensionPolicy)
  expect(res1.canExecute).toBe(true)
  expect(res1.rows.map(r=>r.targetName)).toEqual(['file.png','file(1).png','file(2).png'])

  step.options={
   template:'{name}_{number}',
   startNumber:1,
   step:1,
   padWidth:2,
   skipFirstNumber:false,
   firstTemplate:'{name}',
   dateFormat:'YYYYMMDD'
  }
  const res2=previewBatchRename(entries,checked,[step],defaultExtensionPolicy)
  expect(res2.rows.map(r=>r.targetName)).toEqual(['a_01.png','b_02.png','c_03.png'])
 })

 it('支持查找替换去掉前缀 ori_、正则捕获与多规则流水线叠加',()=>{
  const entries=[makeEntry('file_ori_number1.png',0),makeEntry('file_ori_number2.PNG',1)]
  const checked=new Set(entries.map(e=>e.id))

  const replaceStep=makeRenameStep('replace')
  replaceStep.options={search:'ori_',replaceWith:'',useRegex:false,caseSensitive:false,replaceAll:true}

  const regexStep=makeRenameStep('replace')
  regexStep.options={search:'number(\\d+)',replaceWith:'n$1',useRegex:true,caseSensitive:true,replaceAll:true}

  const res=previewBatchRename(entries,checked,[replaceStep,regexStep],{mode:'lower',customExt:''})
  expect(res.canExecute).toBe(true)
  expect(res.rows.map(r=>r.targetName)).toEqual(['file_n1.png','file_n2.png'])
 })

 it('自然排序正确排列数字序号并拦截非法字符与目录冲突',()=>{
  const entries=[makeEntry('item10.txt',0),makeEntry('item2.txt',1),makeEntry('item1.txt',2)]
  const sorted=sortRenameEntries(entries,'name','asc')
  expect(sorted.map(e=>e.name)).toEqual(['item1.txt','item2.txt','item10.txt'])

  const checked=new Set(sorted.map(e=>e.id))
  const invalidStep=makeRenameStep('template')
  invalidStep.options={template:'bad:name',startNumber:1,step:1,padWidth:1,skipFirstNumber:false,firstTemplate:'{name}',dateFormat:'YYYYMMDD'}
  const bad=previewBatchRename(sorted,checked,[invalidStep],defaultExtensionPolicy)
  expect(bad.canExecute).toBe(false)
  expect(bad.stats.invalid).toBe(3)
 })
})

describe('主进程安全原地改名、SQLite v16 迁移与撤销',()=>{
 it('v16 增量迁移不复活已删除的 files 分类且持久化重命名预设',()=>{
  expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=16').get()).toBeTruthy()
  saveTool({id:'builtin-batch-rename',name:'我的重命名',categoryId:'default',type:'internal',target:'batch-rename',visible:false})
  removeCategory('files')
  closeStore();initStore()
  expect(listCategories().some(c=>c.id==='files')).toBe(false)
  expect(listTools().find(t=>t.id==='builtin-batch-rename')).toMatchObject({name:'我的重命名',categoryId:'default',visible:false})

  const step=makeRenameStep('replace')
  const created=createRenamePreset(getDb(),{name:'去 ori_ 前缀',description:'测试',steps:[step],extensionPolicy:defaultExtensionPolicy})
  expect(listRenamePresets(getDb())).toHaveLength(1)
  const updated=updateRenamePreset(getDb(),created.id,created.revision,{name:'去 ori_ v2',description:'更新',steps:[step],extensionPolicy:{mode:'lower',customExt:''}})
  expect(updated.revision).toBe(2)
  const dup=duplicateRenamePreset(getDb(),updated.id)
  expect(listRenamePresets(getDb())).toHaveLength(2)
  removeRenamePreset(getDb(),dup.id,dup.revision)
  expect(listRenamePresets(getDb())).toHaveLength(1)
 })

 it('支持扫描一级/子目录、a<->b 互换、大小写改名、外部碰撞拦截及一键撤销',async()=>{
  const dir=path.join(workdir,'files')
  const sub=path.join(dir,'sub')
  await mkdir(sub,{recursive:true})
  await writeFile(path.join(dir,'a.txt'),'A')
  await writeFile(path.join(dir,'b.txt'),'B')
  await writeFile(path.join(dir,'keep.txt'),'K')
  await writeFile(path.join(sub,'nested.txt'),'N')

  const service=new BatchRenameService()
  const shallow=await service.inspectSources([dir],false)
  expect(shallow.entries.map(e=>e.name).sort()).toEqual(['a.txt','b.txt','keep.txt'])

  const deep=await service.inspectSources([dir],true)
  expect(deep.entries.map(e=>e.name).sort()).toEqual(['a.txt','b.txt','keep.txt','nested.txt'])

  // 测试互相交换与仅修改大小写
  const res=await service.execute([
   {sourcePath:path.join(dir,'a.txt'),targetName:'b.txt'},
   {sourcePath:path.join(dir,'b.txt'),targetName:'A.txt'}
  ])
  expect(res).toEqual({renamedCount:2,canUndo:true})
  expect((await readdir(dir)).sort()).toEqual(['A.txt','b.txt','keep.txt','sub'])

  // 与外部未参与本批的 keep.txt 碰撞应拒绝并保持磁盘不变
  await expect(service.execute([
   {sourcePath:path.join(dir,'b.txt'),targetName:'keep.txt'}
  ])).rejects.toThrow('目标已存在')

  // 一键撤销恢复原名
  const undone=await service.undo()
  expect(undone).toEqual({renamedCount:2,canUndo:false})
  expect((await readdir(dir)).sort()).toEqual(['a.txt','b.txt','keep.txt','sub'])
 })
})
