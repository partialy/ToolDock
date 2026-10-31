import type Database from '../sqlite'

export function migrateQuickLaunch(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=10').get())return
  db.exec(`CREATE TABLE quick_launch_groups (
   id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),sort_order INTEGER NOT NULL,
   created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE quick_launch_apps (
   id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES quick_launch_groups(id),sort_order INTEGER NOT NULL,
   visible INTEGER NOT NULL CHECK(visible IN (0,1)),name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),description TEXT NOT NULL,
   icon_kind TEXT NOT NULL CHECK(icon_kind IN ('lucide','managed')),icon_value TEXT NOT NULL,
   runtime_shell TEXT NOT NULL CHECK(runtime_shell IN ('powershell','cmd')),ps_flavor TEXT NOT NULL CHECK(ps_flavor IN ('windows','pwsh')),
   source_kind TEXT NOT NULL CHECK(source_kind IN ('inline','file')),inline_content TEXT NOT NULL,
   managed_script_relpath TEXT,script_name TEXT,working_directory TEXT NOT NULL,
   silent INTEGER NOT NULL CHECK(silent IN (0,1)),run_as_admin INTEGER NOT NULL CHECK(run_as_admin IN (0,1)),
   confirm_before_run INTEGER NOT NULL CHECK(confirm_before_run IN (0,1)),confirm_title TEXT NOT NULL,confirm_message TEXT NOT NULL,
   confirm_accept TEXT NOT NULL,confirm_cancel TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE INDEX quick_launch_apps_group_order ON quick_launch_apps(group_id,sort_order);`)
  const now=new Date().toISOString()
  db.prepare('INSERT INTO quick_launch_groups VALUES (?,?,?,?,?)').run('ungrouped','未分组',0,now,now)
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('quickLaunchTrigger','"single"')
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('quickLaunchStopOnExit','false')
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(10,now)
 })()
}
