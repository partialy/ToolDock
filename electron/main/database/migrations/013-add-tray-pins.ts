import type Database from '../sqlite'

/** 仅增加可空固定顺序，保留所有既有工具、分类及用户调整。 */
export function migrateTrayPins(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=13').get())return
  const columns=db.prepare('PRAGMA table_info(tools)').all() as {name:string}[]
  if(!columns.some(c=>c.name==='tray_pin_order'))db.exec('ALTER TABLE tools ADD COLUMN tray_pin_order INTEGER')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tools_tray_pin_order ON tools(tray_pin_order) WHERE tray_pin_order IS NOT NULL')
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(13,new Date().toISOString())
 })()
}
