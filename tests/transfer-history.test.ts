import {describe,it,expect} from 'vitest'
import Database from '../electron/main/database/sqlite'
import {migrateFileTransferHistory} from '../electron/main/database/migrations/011-add-file-transfer-history'
import {saveShareHistory,listShareHistory,getShareHistory,removeShareHistory,clearShareHistory} from '../electron/main/database/file-transfer-history'

describe('文件快传 SQLite v11 历史',()=>{
 it('幂等迁移、按路径去重、300 条上限、删除及恢复索引',()=>{
  const db=new Database(':memory:')
  try{
   db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)')
   migrateFileTransferHistory(db)
   migrateFileTransferHistory(db)
   saveShareHistory(db,'C:\\test\\same.txt','file')
   saveShareHistory(db,'C:\\test\\same.txt','file')
   expect(listShareHistory(db)).toHaveLength(1)
   for(let i=0;i<303;i++)saveShareHistory(db,'C:\\test\\file_'+i+'.txt','file')
   const latest=listShareHistory(db)
   expect(latest).toHaveLength(300)
   const chosen=latest[0]
   expect(getShareHistory(db,[chosen.id])[0].path).toBe(chosen.path)
   expect(listShareHistory(db,'file_')).not.toHaveLength(0)
   removeShareHistory(db,chosen.id)
   expect(listShareHistory(db).some(x=>x.id===chosen.id)).toBe(false)
   clearShareHistory(db)
   expect(listShareHistory(db)).toHaveLength(0)
  }finally{db.close()}
 })
})
