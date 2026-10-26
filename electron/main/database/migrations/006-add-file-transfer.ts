import type Database from '../sqlite'
import {builtinById} from '../../../../src/shared/builtinToolRegistry'
import {TRANSFER_DEFAULTS} from '../../../../src/shared/fileTransferModels'
export function migrateFileTransfer(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=6').get())return
  const def=builtinById('builtin-file-transfer')
  if(!def)throw Error('文件快传的内置工具定义缺失')
  const old=db.prepare('SELECT type,target,is_builtin FROM tools WHERE id=?').get(def.id) as {type:string;target:string;is_builtin:number}|undefined
  if(old&&!(old.type==='internal'&&old.target===def.target&&old.is_builtin===1))throw Error('文件快传内置 ID 存在冲突')
  // A deleted files category must not be resurrected when migration is re-run.
  // Only a fresh v6 migration may create the category.
  if(!db.prepare("SELECT 1 FROM categories WHERE id='files'").get()){
   const rank=(db.prepare('SELECT COALESCE(MAX(sort_order),0)+1 n FROM categories').get() as {n:number}).n
   db.prepare('INSERT INTO categories VALUES (?,?,?,?,?,?)').run('files','文件工具','folder',rank,1,0)
  }
  if(!old){
   const category=db.prepare("SELECT 1 FROM categories WHERE id='files'").get()?'files':'default'
   const rank=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM tools WHERE category_id=?').get(category) as {n:number}).n
   db.prepare('INSERT INTO tools VALUES (?,?,?,?,?,?,?,?,?)').run(def.id,category,def.name,def.icon,'internal',def.target,rank,1,1)
  }
  for(const [key,value] of Object.entries({notificationPosition:'bottom-right',fileTransferPrefs:TRANSFER_DEFAULTS}))
   db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run(key,JSON.stringify(value))
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(6,new Date().toISOString())
 })()
}
