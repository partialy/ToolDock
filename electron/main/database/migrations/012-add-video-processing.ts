import type Database from '../sqlite'
import {builtinById} from '../../../../src/shared/builtinToolRegistry'

/** 迁移只执行一次，后续启动不恢复用户删除的分类或覆盖工具配置。 */
export function migrateVideoProcessing(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=12').get())return
  const def=builtinById('builtin-video-processing')!
  const old=db.prepare('SELECT type,target,is_builtin FROM tools WHERE id=?').get(def.id)
  if(old&&(old.type!=='internal'||old.target!==def.target||old.is_builtin!==1))throw Error('视频处理内置 ID 存在冲突')
  if(!old){
   if(!db.prepare("SELECT 1 FROM categories WHERE id='media'").get()){
    const order=db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM categories').get()!.n
    db.prepare('INSERT INTO categories VALUES (?,?,?,?,?,?)').run('media','音视频工具','film',order!,1,0)
   }
   const order=db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM tools WHERE category_id='media'").get()!.n
   db.prepare('INSERT INTO tools VALUES (?,?,?,?,?,?,?,?,?)').run(def.id,'media',def.name,def.icon,'internal',def.target,order!,1,1)
  }
  db.exec(`CREATE TABLE IF NOT EXISTS media_tasks (
   id TEXT PRIMARY KEY, kind TEXT NOT NULL, input_path TEXT NOT NULL, output_path TEXT,
   source_audio_index INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL,
   percent REAL NOT NULL DEFAULT 0, error_summary TEXT, created_at INTEGER NOT NULL,
   updated_at INTEGER NOT NULL, finished_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
   metadata_json TEXT NOT NULL DEFAULT '{}'
  ); CREATE INDEX IF NOT EXISTS idx_media_tasks_recent ON media_tasks(created_at DESC);`)
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(12,new Date().toISOString())
 })()
}
