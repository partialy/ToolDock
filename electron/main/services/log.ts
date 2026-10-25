import { BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { getDataRoot } from '../database/store'
const logDir=()=>path.join(getDataRoot(),'logs')
export function initLog() {
 try{
  fs.mkdirSync(logDir(),{recursive:true})
  const files=fs.readdirSync(logDir()).filter(f=>/^tooldock-\d{4}-\d{2}-\d{2}(?:-\d+)?\.log$/.test(f))
  const now=Date.now()
  for(const file of files) {
   const p=path.join(logDir(),file)
   const stat=fs.statSync(p)
   if(now-stat.mtimeMs>7*86400_000)fs.rmSync(p,{force:true})
  }
 }catch{/* Logging must never block startup */}
}
export function recordEvent(event:string,kind='info'){
 try {
  const safeEvent=event.replace(/[^a-zA-Z0-9:_ -]/g,'').slice(0,100)
  const file=path.join(logDir(),'tooldock-'+new Date().toISOString().slice(0,10)+'.log')
  if(fs.existsSync(file)&&fs.statSync(file).size>5*1024*1024)return
  fs.appendFileSync(file,new Date().toISOString()+' ['+kind+'] '+safeEvent+'\n')
 }catch{/* Do not fail app for logging */}
}
export async function exportLogs(win:BrowserWindow){
 const picked=await dialog.showSaveDialog(win,{title:'导出 ToolDock 诊断日志',defaultPath:'tooldock-logs.zip',filters:[{name:'ZIP',extensions:['zip']}]})
 if(picked.canceled||!picked.filePath)return null
 const zip=new AdmZip()
 if(fs.existsSync(logDir()))zip.addLocalFolder(logDir(),'logs')
 zip.writeZip(picked.filePath)
 return picked.filePath
}
export function clearLogs(){
 try{fs.rmSync(logDir(),{recursive:true,force:true});fs.mkdirSync(logDir(),{recursive:true})}catch{}
 recordEvent('logs-cleared')
}
