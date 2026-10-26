import type Database from '../sqlite'
import {builtinById} from '../../../../src/shared/builtinToolRegistry'

/** v5: append the built-in QR code generator without resurrecting removed categories. */
export function migrateQrCodeTool(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=5').get())return
  const def=builtinById('builtin-qr-code-tool')
  if(!def)throw Error('缺少二维码内置工具定义')
  const existing=db.prepare('SELECT type,target,is_builtin FROM tools WHERE id=?').get(def.id) as {type:string;target:string;is_builtin:number}|undefined
  if(existing){
   if(existing.type!=='internal'||existing.target!==def.target||existing.is_builtin!==1)throw Error('二维码工具的固定 ID 存在冲突')
  }else{
   const category=db.prepare("SELECT 1 FROM categories WHERE id='images'").get()?'images':'default'
   const order=(db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM tools WHERE category_id=?').get(category) as {n:number}).n
   db.prepare('INSERT INTO tools (id,category_id,name,icon,type,target,sort_order,visible,is_builtin) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(def.id,category,def.name,def.icon,'internal',def.target,order,1,1)
  }
  db.prepare('INSERT INTO schema_migrations (version,applied_at) VALUES (?,?)').run(5,new Date().toISOString())
 })()
}
