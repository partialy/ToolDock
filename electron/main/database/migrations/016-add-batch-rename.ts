import type Database from '../sqlite'
import {builtinById} from '../../../../src/shared/builtinToolRegistry'

/**
 * SQLite v16 增量迁移：注册内置「批量重命名」工具并创建 `rename_presets` 规则预设表。
 * 遵循既有规则：不复活用户已删除的 `files` 分类，也不覆盖用户已有自定义工具配置。
 */
export function migrateBatchRename(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=16').get())return
  const def=builtinById('builtin-batch-rename')
  if(!def)throw Error('缺少批量重命名内置工具定义')
  const old=db.prepare('SELECT type,target,is_builtin FROM tools WHERE id=?').get(def.id) as {type:string;target:string;is_builtin:number}|undefined
  if(old&&(old.type!=='internal'||old.target!==def.target||old.is_builtin!==1))throw Error('批量重命名内置 ID 存在冲突')

  db.exec(
   "CREATE TABLE IF NOT EXISTS rename_presets (" +
   "id TEXT PRIMARY KEY NOT NULL," +
   "name TEXT NOT NULL," +
   "description TEXT NOT NULL DEFAULT ''," +
   "schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1)," +
   "config_json TEXT NOT NULL," +
   "revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1)," +
   "created_at TEXT NOT NULL," +
   "updated_at TEXT NOT NULL)"
  )
  const columns=new Set((db.prepare('PRAGMA table_info(rename_presets)').all() as {name:string}[]).map(x=>x.name))
  for(const required of ['id','name','description','schema_version','config_json','revision','created_at','updated_at']){
   if(!columns.has(required))throw Error('重命名预设表结构存在冲突，已安全中止迁移')
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_rename_presets_updated ON rename_presets(updated_at DESC,id ASC)')

  if(!old){
   const category=db.prepare("SELECT 1 FROM categories WHERE id='files'").get()?'files':'default'
   const order=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM tools WHERE category_id=?').get(category) as {n:number}).n
   db.prepare('INSERT INTO tools(id,category_id,name,icon,type,target,sort_order,visible,is_builtin) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(def.id,category,def.name,def.icon,'internal',def.target,order,1,1)
  }
  db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(16,new Date().toISOString())
 })()
}
