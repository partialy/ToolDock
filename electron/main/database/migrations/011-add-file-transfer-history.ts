import type Database from '../sqlite'

/** Keeps only paths, never file contents. Migration intentionally preserves existing settings and tools. */
export function migrateFileTransferHistory(db: Database) {
 db.transaction(() => {
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE version=11').get()) return
  db.exec(`
   CREATE TABLE IF NOT EXISTS file_transfer_share_history (
    id TEXT PRIMARY KEY,
    normalized_path TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('file','directory')),
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL
   );
   CREATE INDEX IF NOT EXISTS idx_transfer_history_recent
    ON file_transfer_share_history(last_used_at DESC, id DESC);
  `)
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(11, new Date().toISOString())
 })()
}
