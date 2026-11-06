import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import Database from '../database/sqlite'
import { closeStore, getDataRoot, getDb, initStore, setBoot, defaultDataRoot } from '../database/store'
import { prepareWebviewsForDataMove } from '../views/webviews'
import {addDataFolder,validateDataArchive} from './data-archive'
import {prepareDataMigration} from './data-migration'

const marker='.tooldock-data'
function canonical(p:string){return path.resolve(p).toLowerCase()}
function related(a:string,b:string){let x=canonical(a),y=canonical(b);return x===y||x.startsWith(y+path.sep)||y.startsWith(x+path.sep)}
function verifyDirectory(p:string){if(!fs.statSync(p).isDirectory()||!fs.existsSync(path.join(p,marker)))throw Error('不是 ToolDock 专属数据目录')}
export function initMarker(){const p=path.join(getDataRoot(),marker);if(!fs.existsSync(p))fs.writeFileSync(p,'ToolDock user data\n')}
export async function chooseDataFolder(win:BrowserWindow) {
 const r=await dialog.showOpenDialog(win,{title:'选择新的 ToolDock 数据目录',properties:['openDirectory','createDirectory']})
 return r.canceled?null:r.filePaths[0]
}
export async function migrateData(win:BrowserWindow,target:string) {
 const old=getDataRoot(),migration=prepareDataMigration(old,target,[app.getPath('userData'),app.getAppPath()]),dest=migration.target
 const historyId=randomUUID();let recorded=false,closed=false,bootAttempted=false
 try {
  // 网页会话落盘后关闭 SQLite，再复制完整的静止数据快照。
  await prepareWebviewsForDataMove(win)
  getDb().prepare('INSERT INTO migration_history (id,old_path,new_path,created_at) VALUES (?,?,?,?)').run(historyId,old,dest,new Date().toISOString());recorded=true
  closed=true;closeStore()
  migration.copy()
  verifyDirectory(migration.payload)
  const newDb=path.join(migration.payload,'tooldock.sqlite')
  if(!fs.existsSync(newDb))throw Error('数据库未复制')
  const check=new Database(newDb,{readonly:true})
  try{if(check.pragma('integrity_check',{simple:true})!=='ok')throw Error('迁移后的数据库完整性检查失败')}
  finally{check.close()}
  // 验证后排他写入目标；目标目录及并发写入的用户文件始终保留。
  migration.publish()
  bootAttempted=true;setBoot(dest)
  initStore()
  return {restartRequired:true}
 } catch(e) {
  if(closed){
   try{closeStore()}catch{}
   try{if(bootAttempted)setBoot(old);initStore()}
   catch(rollbackError){throw new AggregateError([e,rollbackError],'迁移失败且原数据库重新打开失败；原目录和目标内容均已保留，请勿删除并检查存储权限')}
  }
  if(recorded)getDb().prepare('DELETE FROM migration_history WHERE id=?').run(historyId)
  throw e
 }finally{try{migration.cleanup()}catch{/* 只保留无法清理的专属暂存副本，不将清理失败误报为启动定位切换失败。 */}}
}
export async function deleteOldData(id:string) {
 const row=getDb().prepare('SELECT * FROM migration_history WHERE id=?').get(id) as {old_path:string;removed:number}|undefined
 if(!row||row.removed)throw Error('迁移记录不存在或已清理')
 if(related(row.old_path,getDataRoot())||related(row.old_path,defaultDataRoot())&&canonical(getDataRoot())===canonical(defaultDataRoot()))throw Error('不能清理当前数据目录')
 verifyDirectory(row.old_path)
 fs.rmSync(row.old_path,{recursive:true,force:true})
 getDb().prepare('UPDATE migration_history SET removed=1 WHERE id=?').run(id)
}
export async function openDataFolder(){await shell.openPath(getDataRoot())}
export async function backupData(win:BrowserWindow):Promise<string|null> {
 const save=await dialog.showSaveDialog(win,{title:'备份 ToolDock 数据',defaultPath:'ToolDock-Backup-'+new Date().toISOString().slice(0,10)+'.zip',filters:[{name:'ZIP',extensions:['zip']}]})
 if(save.canceled||!save.filePath)return null
 getDb().pragma('wal_checkpoint(PASSIVE)')
 const temp=path.join(app.getPath('temp'),'tooldock-backup-'+randomUUID()+'.sqlite')
 try {
  await getDb().backup(temp)
  const zip=new AdmZip()
  const root=getDataRoot()
  zip.addLocalFile(temp,'','tooldock.sqlite')
  for(const sub of ['tools','outputs'] as const)addDataFolder(zip,root,sub)
  zip.addFile('manifest.json',Buffer.from(JSON.stringify({app:'ToolDock',format:1,createdAt:new Date().toISOString()})))
  zip.writeZip(save.filePath)
  return save.filePath
 }finally{fs.rmSync(temp,{force:true})}
}
export async function restoreData(win:BrowserWindow):Promise<{restartRequired:boolean}|null> {
 const picked=await dialog.showOpenDialog(win,{title:'恢复 ToolDock 备份',properties:['openFile'],filters:[{name:'ToolDock ZIP',extensions:['zip']}]})
 if(picked.canceled)return null
 const zip=new AdmZip(picked.filePaths[0])
 const entries=zip.getEntries()
 validateDataArchive(entries)
 const names=entries.map(e=>e.entryName)
 if(!names.includes('manifest.json')||!names.includes('tooldock.sqlite'))throw Error('不支持的备份格式')
 const manifest=JSON.parse(zip.readAsText('manifest.json')) as {app?:string;format?:number}
 if(manifest.app!=='ToolDock'||manifest.format!==1)throw Error('备份版本不兼容')
 const dir=path.join(app.getPath('temp'),'tooldock-restore-'+randomUUID())
 fs.mkdirSync(dir,{recursive:true})
 zip.extractAllTo(dir,true)
 const checkDb=new Database(path.join(dir,'tooldock.sqlite'),{readonly:true})
 const okay=checkDb.pragma('integrity_check',{simple:true});checkDb.close()
 if(okay!=='ok')throw Error('备份数据库完整性校验失败')
 const confirm=await dialog.showMessageBox(win,{type:'warning',title:'确认恢复备份',message:'恢复将替换当前分类、工具和设置，是否继续？',buttons:['取消','确认恢复'],defaultId:0,cancelId:0})
 if(confirm.response!==1){fs.rmSync(dir,{recursive:true,force:true});return null}
 const root=getDataRoot()
 const rollback=root+'.rollback-'+randomUUID()
 closeStore()
 try {
  fs.cpSync(root,rollback,{recursive:true})
  for(const file of ['tooldock.sqlite','tools','outputs']) {
   fs.rmSync(path.join(root,file),{recursive:true,force:true})
   const src=path.join(dir,file)
   if(fs.existsSync(src))fs.cpSync(src,path.join(root,file),{recursive:true})
  }
  initStore()
  return {restartRequired:true}
 }catch(e){
  for(const file of ['tooldock.sqlite','tools','outputs']){
   fs.rmSync(path.join(root,file),{recursive:true,force:true})
   if(fs.existsSync(path.join(rollback,file)))fs.cpSync(path.join(rollback,file),path.join(root,file),{recursive:true})
  }
  initStore();throw e
 }finally {fs.rmSync(dir,{recursive:true,force:true})}
}
