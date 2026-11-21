import type Database from '../sqlite'
import {builtinById} from '../../../../src/shared/builtinToolRegistry'

export function migrateEnvManager(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=15').get())return
  const def=builtinById('builtin-env-manager')
  if(!def)throw Error('缺少环境变量内置工具定义')
  const old=db.prepare('SELECT type,target,is_builtin FROM tools WHERE id=?').get(def.id) as {type:string;target:string;is_builtin:number}|undefined
  if(old&&(old.type!=='internal'||old.target!==def.target||old.is_builtin!==1))throw Error('环境变量内置 ID 存在冲突')
  if(!old){
   const category=db.prepare("SELECT 1 FROM categories WHERE id='developer'").get()?'developer':'default'
   const order=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM tools WHERE category_id=?').get(category) as {n:number}).n
   db.prepare('INSERT INTO tools(id,category_id,name,icon,type,target,sort_order,visible,is_builtin) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(def.id,category,def.name,def.icon,'internal',def.target,order,1,1)
  }
  db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)').run(15,new Date().toISOString())
 })()
}
