import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import Database from '../database/sqlite'
import { closeStore, getDataRoot, getDb, initStore, setBoot, defaultDataRoot } from '../database/store'
import { prepareWebviewsForDataMove } from '../views/webviews'

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
 const old=getDataRoot(),dest=path.resolve(target)
 if(related(dest,old)||related(dest,app.getPath('userData'))||related(dest,app.getAppPath()))throw Error('不能使用当前数据目录或其上级/子级目录')
 if(fs.existsSync(dest)&&fs.readdirSync(dest).length)throw Error('目标目录必须为空，请选择一个空文件夹')
 fs.mkdirSync(dest,{recursive:true})
 fs.accessSync(dest,fs.constants.W_OK)
 const historyId=randomUUID()
 // 迁移前先将正在运行的网页会话写盘并移除原生视图，避免复制活动中的 Cookie 数据。
 await prepareWebviewsForDataMove(win)
 getDb().prepare('INSERT INTO migration_history (id,old_path,new_path,created_at) VALUES (?,?,?,?)').run(historyId,old,dest,new Date().toISOString())
 closeStore()
 try {
  fs.cpSync(old,dest,{recursive:true,force:false,errorOnExist:true})
  verifyDirectory(dest)
  const newDb=path.join(dest,'tooldock.sqlite')
  if(!fs.existsSync(newDb))throw Error('数据库未复制')
  const check=new Database(newDb,{readonly:true})
  try{if(check.pragma('integrity_check',{simple:true})!=='ok')throw Error('迁移后的数据库完整性检查失败')}
  finally{check.close()}
  // 只在所有文件复制和数据库校验成功之后切换启动定位。
  setBoot(dest)
  initStore()
  return {restartRequired:true}
 } catch(e) {
  try{closeStore()}catch{}
  try{setBoot(old)}catch{}
  try{fs.rmSync(dest,{recursive:true,force:true})}catch{}
  initStore()
  getDb().prepare('DELETE FROM migration_history WHERE id=?').run(historyId)
  throw e
 }
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
  for(const sub of ['tools','outputs'])if(fs.existsSync(path.join(root,sub)))zip.addLocalFolder(path.join(root,sub),sub)
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
 const names=entries.map(e=>e.entryName)
 if(!names.includes('manifest.json')||!names.includes('tooldock.sqlite'))throw Error('不支持的备份格式')
 const manifest=JSON.parse(zip.readAsText('manifest.json')) as {app?:string;format?:number}
 if(manifest.app!=='ToolDock'||manifest.format!==1)throw Error('备份版本不兼容')
 for(const entry of entries) {
  if(entry.entryName.startsWith('/')||entry.entryName.includes('..')||entry.entryName.includes('\\')||entry.isDirectory===false&&entry.header.size>1024*1024*1024)throw Error('备份中存在不安全的文件路径或超大文件')
 }
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
