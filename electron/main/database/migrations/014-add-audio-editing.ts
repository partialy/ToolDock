import type Database from '../sqlite'

/** 独立音频工程/导出记录；不触碰 v12 媒体任务和用户工具配置。 */
export function migrateAudioEditing(db:Database){
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(14))return
  db.exec(`
   CREATE TABLE IF NOT EXISTS audio_projects (
    id TEXT PRIMARY KEY, source_key TEXT NOT NULL, stream_index INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, project_json TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_opened_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_audio_projects_source ON audio_projects(source_key,stream_index);
   CREATE INDEX IF NOT EXISTS idx_audio_projects_recent ON audio_projects(last_opened_at DESC);
   CREATE TABLE IF NOT EXISTS audio_export_jobs (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
    state TEXT NOT NULL, created_at INTEGER NOT NULL,
    finished_at INTEGER, job_json TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_audio_jobs_recent ON audio_export_jobs(created_at DESC);
  `)
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(14,new Date().toISOString())
 })()
}
