import Database from './sqlite'
import { migrateJsonTool } from './migrations/002-add-json-tool'
import { migrateImageDevtools } from './migrations/003-add-image-devtools'
import { migrateImageEncoding } from './migrations/004-add-image-encoding'
import { migrateQrCodeTool } from './migrations/005-add-qr-code-tool'
import { migrateFileTransfer } from './migrations/006-add-file-transfer'
import { migrateTextDiff } from './migrations/007-add-text-diff'
import { migrateCodecPipelines } from './migrations/008-add-codec-pipelines'
import { migrateCommandTool } from './migrations/009-add-command-tool'
import { migrateQuickLaunch } from './migrations/010-add-quick-launch'
import {migrateFileTransferHistory} from './migrations/011-add-file-transfer-history'
import {TRANSFER_DEFAULTS} from '../../../src/shared/fileTransferModels'
import { builtinById, builtinByTarget } from '../../../src/shared/builtinToolRegistry'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Category, Tool, Settings, DataInfo } from '../../../src/types/models'

let db: Database
let dataRoot = ''
const defaultPrefs: Settings = { theme: 'dark', motion: 'normal', showDefaultTag: true, allowHttp: false, sidebarWidth: 252,notificationPosition:'bottom-right',fileTransferPrefs:TRANSFER_DEFAULTS,quickLaunchTrigger:'single',quickLaunchStopOnExit:false }
const bootstrapFile = () => path.join(app.getPath('userData'), 'bootstrap.json')
export const defaultDataRoot = () => path.join(app.getPath('userData'), 'data')
export function getDataRoot() { return dataRoot }
export function getDb() { return db }
export function getBoot() { try { return JSON.parse(fs.readFileSync(bootstrapFile(),'utf8')) as {dataRoot?:string} } catch { return {} } }
export function setBoot(newPath:string) { const p=bootstrapFile(); fs.writeFileSync(p+'.tmp',JSON.stringify({dataRoot:newPath},null,2)); fs.renameSync(p+'.tmp',p) }
export function initStore() {
  dataRoot = path.resolve(getBoot().dataRoot || defaultDataRoot())
  fs.mkdirSync(dataRoot,{recursive:true})
  fs.mkdirSync(path.join(dataRoot,'profiles'),{recursive:true})
  fs.mkdirSync(path.join(dataRoot,'tools'),{recursive:true})
  db = new Database(path.join(dataRoot,'tooldock.sqlite'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY,name TEXT NOT NULL,icon TEXT NOT NULL DEFAULT 'folder',sort_order INTEGER NOT NULL,visible INTEGER NOT NULL DEFAULT 1,is_system INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS tools (id TEXT PRIMARY KEY,category_id TEXT NOT NULL REFERENCES categories(id),name TEXT NOT NULL,icon TEXT NOT NULL DEFAULT 'wrench',type TEXT NOT NULL,target TEXT NOT NULL DEFAULT '',sort_order INTEGER NOT NULL,visible INTEGER NOT NULL DEFAULT 1,is_builtin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS migration_history (id TEXT PRIMARY KEY,old_path TEXT NOT NULL,new_path TEXT NOT NULL,created_at TEXT NOT NULL,removed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
  `)
  db.transaction(()=>{
    const firstLaunch=(db.prepare('SELECT COUNT(*) AS n FROM categories').get() as {n:number}).n===0
    // 只在首次初始化时填充示例分类；用户以后删除的分类不能在重启时复活。
    if(firstLaunch){
      db.prepare('INSERT INTO categories VALUES (?,?,?,?,?,?)').run('default','默认分类','folder',0,1,1)
      db.prepare('INSERT INTO categories VALUES (?,?,?,?,?,?)').run('developer','开发工具','code-2',1,1,0)
      db.prepare('INSERT INTO tools VALUES (?,?,?,?,?,?,?,?,?)').run('builtin-key-generator','developer','密钥生成器','key-round','internal','key-generator',0,1,1)
    }
    db.prepare("UPDATE tools SET is_builtin=1 WHERE id='builtin-key-generator'").run()
    for(const [key,value] of Object.entries(defaultPrefs)) db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run(key,JSON.stringify(value))
    db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (?,?)').run(1,new Date().toISOString())
  })()
  migrateJsonTool(db)
  migrateImageDevtools(db)
  migrateImageEncoding(db)
  migrateQrCodeTool(db)
  migrateFileTransfer(db)
  migrateTextDiff(db)
  migrateCodecPipelines(db)
  migrateCommandTool(db)
  migrateQuickLaunch(db)
  migrateFileTransferHistory(db)

}
export function closeStore() { if(db?.open) { db.pragma('wal_checkpoint(TRUNCATE)'); db.close() } }
const asCategory=(r:Record<string,unknown>):Category=>({id:String(r.id),name:String(r.name),icon:String(r.icon),sortOrder:Number(r.sort_order),visible:Boolean(r.visible),isSystem:Boolean(r.is_system)})
const asTool=(r:Record<string,unknown>):Tool=>({id:String(r.id),categoryId:String(r.category_id),name:String(r.name),icon:String(r.icon),type:r.type as Tool['type'],target:String(r.target),sortOrder:Number(r.sort_order),visible:Boolean(r.visible),isBuiltin:Boolean(r.is_builtin)})
export const listCategories=():Category[]=>(db.prepare('SELECT * FROM categories ORDER BY sort_order,id').all() as Record<string,unknown>[]).map(asCategory)
export const listTools=():Tool[]=>(db.prepare('SELECT * FROM tools ORDER BY category_id,sort_order,id').all() as Record<string,unknown>[]).map(asTool)
export function saveCategory(input:Partial<Category>&{name:string}) {
  const id=input.id||randomUUID()
  const prev=db.prepare('SELECT * FROM categories WHERE id=?').get(id) as Record<string,unknown>|undefined
  const item:Category={id,name:input.name.trim(),icon:input.icon||'folder',sortOrder:prev?Number(prev.sort_order):(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM categories').get() as {n:number}).n,visible:input.visible??(prev?Boolean(prev.visible):true),isSystem:Boolean(prev?.is_system)}
  if(!item.name||item.name.length>60) throw Error('分类名称必须是1-60个字符')
  db.prepare('INSERT INTO categories (id,name,icon,sort_order,visible,is_system) VALUES (@id,@name,@icon,@sortOrder,@visible,@isSystem) ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon,visible=excluded.visible').run({...item,visible:Number(item.visible),isSystem:Number(item.isSystem)})
  return asCategory(db.prepare('SELECT * FROM categories WHERE id=?').get(id) as Record<string,unknown>)
}
export function removeCategory(id:string) {
 if(id==='default')throw Error('默认分类不可删除')
 db.transaction(()=>{
  if(!db.prepare('SELECT id FROM categories WHERE id=?').get(id))throw Error('分类不存在')
  const max=(db.prepare("SELECT COALESCE(MAX(sort_order),-1) AS n FROM tools WHERE category_id='default'").get() as {n:number}).n
  const moved=db.prepare('SELECT id FROM tools WHERE category_id=? ORDER BY sort_order').all(id) as {id:string}[]
  moved.forEach((r,i)=>db.prepare("UPDATE tools SET category_id='default',sort_order=? WHERE id=?").run(max+i+1,r.id))
  db.prepare('DELETE FROM categories WHERE id=?').run(id)
 })()
}
export function reorderCategories(ids:string[]) {
 const have=listCategories().map(x=>x.id); if(ids.length!==have.length||new Set(ids).size!==have.length||!ids.every(x=>have.includes(x)))throw Error('分类排序列表不完整')
 db.transaction(()=>ids.forEach((id,i)=>db.prepare('UPDATE categories SET sort_order=? WHERE id=?').run(i,id)))()
}
export function saveTool(input:Partial<Tool> & {name:string; categoryId:string; type:string; target:string}):Tool {
 const id=input.id||randomUUID()
 const prev=db.prepare('SELECT * FROM tools WHERE id=?').get(id) as Record<string,unknown>|undefined
 if(!db.prepare('SELECT id FROM categories WHERE id=?').get(input.categoryId))throw Error('分类不存在')
 if(!input.name.trim()||input.name.trim().length>80)throw Error('工具名称必须为1-80个字符')
 if(!['link','internal'].includes(input.type))throw Error('此工具类型暂未开放')
 if(input.type==='link') {const u=new URL(input.target);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('只支持 HTTP(S) 链接且不能包含账号密码')}
 if(input.type==='internal'&&!builtinByTarget(input.target))throw Error('无效的内置页面')
 if(prev?.is_builtin && (input.type!==prev.type||input.target!==prev.target||!builtinById(id)))throw Error('不可改变预置工具的类型和目标')
 if(input.type==='internal'&&(!prev||!prev.is_builtin||builtinById(id)?.target!==input.target))throw Error('不能自行创建或篡改内置工具')
 const item={id,categoryId:input.categoryId,name:input.name.trim(),icon:input.icon||'wrench',type:input.type,target:input.target,sortOrder:prev?Number(prev.sort_order):(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM tools WHERE category_id=?').get(input.categoryId) as {n:number}).n,visible:Number(input.visible??(prev?Boolean(prev.visible):true)),isBuiltin:Number(Boolean(prev?.is_builtin))}
 db.prepare('INSERT INTO tools VALUES (@id,@categoryId,@name,@icon,@type,@target,@sortOrder,@visible,@isBuiltin) ON CONFLICT(id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,icon=excluded.icon,type=excluded.type,target=excluded.target,sort_order=excluded.sort_order,visible=excluded.visible').run(item)
 return asTool(db.prepare('SELECT * FROM tools WHERE id=?').get(id) as Record<string,unknown>)
}
export function removeTool(id:string) {
 const t=db.prepare('SELECT * FROM tools WHERE id=?').get(id) as Record<string,unknown>|undefined
 if(!t)throw Error('工具不存在')
 if(t.is_builtin)throw Error('内置工具仅能隐藏，不能删除')
 db.prepare('DELETE FROM tools WHERE id=?').run(id)
}
export function reorderTools(categoryId:string,ids:string[]) {
 const current=listTools().filter(t=>t.categoryId===categoryId).map(t=>t.id)
 if(ids.length!==current.length||new Set(ids).size!==current.length||!ids.every(id=>current.includes(id)))throw Error('工具排序列表不完整')
 db.transaction(()=>ids.forEach((id,i)=>db.prepare('UPDATE tools SET sort_order=? WHERE id=?').run(i,id)))()
}
export function getSettings():Settings {
 const rows=db.prepare('SELECT * FROM settings').all() as {key:string;value_json:string}[]
 const result:Record<string,unknown>={...defaultPrefs}
 rows.forEach(row=>{if(row.key in defaultPrefs)try{result[row.key]=JSON.parse(row.value_json)}catch{}})
 if(!['top-left','top-right','bottom-left','bottom-right'].includes(String(result.notificationPosition)))result.notificationPosition='bottom-right'
 if(result.quickLaunchTrigger!=='single'&&result.quickLaunchTrigger!=='double')result.quickLaunchTrigger='single'
 if(typeof result.quickLaunchStopOnExit!=='boolean')result.quickLaunchStopOnExit=false
 const raw=result.fileTransferPrefs
 const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{}
 const prefs={...TRANSFER_DEFAULTS}
 if(input.receiveDirectory===null||(typeof input.receiveDirectory==='string'&&input.receiveDirectory.length<=4096))prefs.receiveDirectory=input.receiveDirectory as string|null
 if(typeof input.allowDownload==='boolean')prefs.allowDownload=input.allowDownload
 if(typeof input.allowUpload==='boolean')prefs.allowUpload=input.allowUpload
 const positive=(key:'maxFileBytes'|'maxTempBytes'|'maxUploads'|'maxDownloads',min:number,max:number)=>{
  const n=input[key]
  if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max)prefs[key]=n
 }
 positive('maxFileBytes',1024**2,50*1024**3)
 positive('maxTempBytes',1024**2,100*1024**3)
 positive('maxUploads',1,4)
 positive('maxDownloads',1,8)
 if(prefs.maxTempBytes<prefs.maxFileBytes)prefs.maxTempBytes=Math.max(TRANSFER_DEFAULTS.maxTempBytes,prefs.maxFileBytes)
 if(!prefs.receiveDirectory)prefs.allowUpload=false
 result.fileTransferPrefs=prefs
 return result as unknown as Settings
}
export function putSetting(key:keyof Settings,value:Settings[keyof Settings]):Settings {
 if(!(key in defaultPrefs))throw Error('未知设置项')
 if(key==='quickLaunchTrigger'&&value!=='single'&&value!=='double')throw Error('无效启动方式')
 if(key==='quickLaunchStopOnExit'&&typeof value!=='boolean')throw Error('无效退出设置')
 db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key,JSON.stringify(value))
 return getSettings()
}
export function getDataInfo():DataInfo {
 const previous=db.prepare('SELECT * FROM migration_history ORDER BY created_at DESC').all() as {id:string;old_path:string;created_at:string;removed:number}[]
 return {root:dataRoot,defaultRoot:defaultDataRoot(),oldCopies:previous.map(x=>({id:x.id,path:x.old_path,date:x.created_at,removed:Boolean(x.removed)}))}
}
