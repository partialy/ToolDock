import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from '../electron/main/database/sqlite'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, {recursive:true,force:true}) })
describe('Node 内置 SQLite 兼容层', () => {
  it('事务失败时完整回滚', () => {
    const dir=mkdtempSync(path.join(tmpdir(),'tooldock-sqlite-'));dirs.push(dir)
    const db=new Database(path.join(dir,'test.db'))
    try {
      db.exec('CREATE TABLE a(n INTEGER)')
      expect(() => db.transaction(() => {
        db.prepare('INSERT INTO a VALUES (?)').run(1)
        throw new Error('rollback')
      })()).toThrow('rollback')
      expect(db.prepare('SELECT COUNT(*) AS n FROM a').get()).toMatchObject({n:0})
    } finally { db.close() }
  })
  it('备份数据库可独立读取，完整性检查通过', async () => {
    const dir=mkdtempSync(path.join(tmpdir(),'tooldock-backup-'));dirs.push(dir)
    const db=new Database(path.join(dir,'source.db'))
    try {
      db.exec('CREATE TABLE a(id TEXT PRIMARY KEY, name TEXT)')
      db.prepare('INSERT INTO a VALUES (?,?)').run('one','备份测试')
      await db.backup(path.join(dir,'copy.db'))
      const restored=new Database(path.join(dir,'copy.db'),{readonly:true})
      try {
        expect(restored.pragma('integrity_check',{simple:true})).toBe('ok')
        expect(restored.prepare('SELECT name FROM a WHERE id=?').get('one')).toMatchObject({name:'备份测试'})
      } finally { restored.close() }
    } finally { db.close() }
  })
})
