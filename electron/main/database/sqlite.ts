import { DatabaseSync, backup as backupSqlite } from 'node:sqlite'

/**
 * Compatibility layer for ToolDock's synchronous repositories.
 * Uses Node's bundled SQLite so Electron builds require no C++ addon toolchain.
 */
export default class Database {
  private readonly raw: DatabaseSync

  constructor(filename: string, options?: { readonly?: boolean }) {
    this.raw = new DatabaseSync(filename, { readOnly: options?.readonly ?? false })
  }

  get open() { return this.raw.isOpen }
  prepare(sql: string) { return this.raw.prepare(sql) }
  exec(sql: string) { return this.raw.exec(sql) }
  close() { this.raw.close() }

  pragma(sql: string, options?: { simple?: boolean }): unknown {
    const row = this.raw.prepare('PRAGMA ' + sql).get()
    if (options?.simple && row) return Object.values(row)[0]
    return row
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      this.raw.exec('BEGIN IMMEDIATE')
      try {
        const result = fn()
        this.raw.exec('COMMIT')
        return result
      } catch (error) {
        this.raw.exec('ROLLBACK')
        throw error
      }
    }
  }

  async backup(destination: string) {
    await backupSqlite(this.raw, destination)
  }
}
