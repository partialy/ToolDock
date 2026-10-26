import type Database from '../sqlite'
import { BUILTIN_TOOLS } from '../../../../src/shared/builtinToolRegistry'

/** SQLite v3: transactionally add image tools and developer utilities without changing user customizations. */
export function migrateImageDevtools(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=3').get())return
  if(!db.prepare("SELECT id FROM categories WHERE id='images'").get()){
   const sort=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM categories').get() as {n:number}).n
   db.prepare('INSERT INTO categories (id,name,icon,sort_order,visible,is_system) VALUES (?,?,?,?,?,?)').run('images','图片工具','images',sort,1,0)
  }
  for(const def of BUILTIN_TOOLS.filter(t=>['builtin-image-processor','builtin-logo-icon-generator','builtin-time-converter','builtin-uuid-generator'].includes(t.id))){
   const old=db.prepare('SELECT type,target,is_builtin FROM tools WHERE id=?').get(def.id) as {type:string;target:string;is_builtin:number}|undefined
   if(old){
    if(old.type!=='internal'||old.target!==def.target||!old.is_builtin)throw Error('内置工具 ID 冲突：'+def.id)
    continue
   }
   const category=db.prepare('SELECT 1 FROM categories WHERE id=?').get(def.defaultCategoryId)?def.defaultCategoryId:'default'
   const sort=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM tools WHERE category_id=?').get(category) as {n:number}).n
   db.prepare('INSERT INTO tools (id,category_id,name,icon,type,target,sort_order,visible,is_builtin) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(def.id,category,def.name,def.icon,'internal',def.target,sort,1,1)
  }
  db.prepare('INSERT INTO schema_migrations (version,applied_at) VALUES (?,?)').run(3,new Date().toISOString())
 })()
}
