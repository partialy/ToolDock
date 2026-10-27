import type Database from '../sqlite'
import {builtinById} from '../../../../src/shared/builtinToolRegistry'
export function migrateCodecPipelines(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=8').get())return
  const def=builtinById('builtin-codec-tool')
  if(!def)throw Error('缺少编解码内置工具定义')
  const old=db.prepare('SELECT type,target,is_builtin FROM tools WHERE id=?').get(def.id) as {type:string;target:string;is_builtin:number}|undefined
  if(old&&(old.type!=='internal'||old.target!==def.target||old.is_builtin!==1))throw Error('编解码内置 ID 存在冲突')
  db.exec("CREATE TABLE IF NOT EXISTS codec_pipelines (id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version=1),steps_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),created_at TEXT NOT NULL,updated_at TEXT NOT NULL)")
  const columns=new Set((db.prepare('PRAGMA table_info(codec_pipelines)').all() as {name:string}[]).map(x=>x.name))
  for(const required of ['id','name','description','schema_version','steps_json','revision','created_at','updated_at'])if(!columns.has(required))throw Error('编解码流程表结构存在冲突，已安全中止迁移')
  db.exec('CREATE INDEX IF NOT EXISTS idx_codec_pipelines_updated ON codec_pipelines(updated_at DESC,id ASC)')
  if(!old){
   const category=db.prepare("SELECT 1 FROM categories WHERE id='developer'").get()?'developer':'default'
   const order=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM tools WHERE category_id=?').get(category) as {n:number}).n
   db.prepare('INSERT INTO tools(id,category_id,name,icon,type,target,sort_order,visible,is_builtin) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(def.id,category,def.name,def.icon,'internal',def.target,order,1,1)
  }
  db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(8,new Date().toISOString())
 })()
}
