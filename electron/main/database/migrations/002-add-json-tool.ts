import type Database from '../sqlite'
import { BUILTIN_TOOLS } from '../../../../src/shared/builtinToolRegistry'

/** v2: 仅增量注册 JSON 内置工具，不能重新创建被用户删除的 developer 分类。 */
export function migrateJsonTool(db:Database) {
  db.transaction(()=>{
    const migrated=db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()
    if(migrated)return
    const definition=BUILTIN_TOOLS.find(item=>item.id==='builtin-json-tool')!
    const old=db.prepare('SELECT * FROM tools WHERE id=?').get(definition.id) as {type:string;target:string;is_builtin:number}|undefined
    if(old){
      if(old.type!=='internal'||old.target!==definition.target||!old.is_builtin)throw Error('内置 JSON 工具 ID 冲突，迁移已取消')
    }else{
      const developer=db.prepare("SELECT id FROM categories WHERE id='developer'").get()
      const categoryId=developer?'developer':'default'
      const {sortOrder}=db.prepare('SELECT COALESCE(MAX(sort_order), -1)+1 AS sortOrder FROM tools WHERE category_id=?').get(categoryId) as {sortOrder:number}
      db.prepare('INSERT INTO tools (id,category_id,name,icon,type,target,sort_order,visible,is_builtin) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(definition.id,categoryId,definition.name,definition.icon,'internal',definition.target,sortOrder,1,1)
    }
    db.prepare('INSERT INTO schema_migrations (version,applied_at) VALUES (?,?)').run(2,new Date().toISOString())
  })()
}
