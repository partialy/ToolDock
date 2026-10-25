import { app, BrowserWindow, dialog, ipcMain, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { initStore, closeStore, listCategories, saveCategory, removeCategory, reorderCategories, listTools, saveTool, removeTool, reorderTools, getSettings, putSetting, getDataInfo } from './database/store'
import { allowedUrl, openWebview, removeWebview, setWebBounds, hideWebview, showWebview, reloadWebview, clearWebData } from './views/webviews'
import { initMarker, chooseDataFolder, migrateData, deleteOldData, openDataFolder, backupData, restoreData } from './services/data'
import { generateRsa, generateSsh, generateAes, generateRandom } from './services/crypto'
import { initLog, recordEvent, exportLogs, clearLogs } from './services/log'

const devMode=!app.isPackaged
app.setName(devMode?'ToolDock-Dev':'ToolDock')
const base=path.join(app.getPath('appData'),devMode?'ToolDock-Dev':'ToolDock')
fs.mkdirSync(base,{recursive:true})
app.setPath('userData',base)
const stateFile=path.join(base,'window.json')
let win:BrowserWindow|null=null
let closing=false
const isMain=(event:Electron.IpcMainInvokeEvent)=>!!win&&!win.isDestroyed()&&event.sender===win.webContents
function register<T>(channel:string,fn:(arg:T)=>unknown|Promise<unknown>){ipcMain.handle(channel,async(e,arg:T)=>{if(!isMain(e))throw Error('不可信的 IPC 来源');try{return await fn(arg)}catch(e){recordEvent('ipc-failed:'+channel,'error');throw e}})}
const text=z.string().min(1).max(500)
const categoryInput=z.object({id:z.string().optional(),name:z.string().min(1).max(60),icon:z.string().max(80).optional(),visible:z.boolean().optional()})
const toolInput=z.object({id:z.string().optional(),name:z.string().min(1).max(80),icon:z.string().max(80).optional(),visible:z.boolean().optional(),categoryId:z.string(),type:z.enum(['link','internal']),target:z.string().max(2048)})
const order=z.array(z.string()).max(10000)
const dimensions=z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().finite().min(0).max(10000),height:z.number().finite().min(0).max(10000)})
function channels(){
 register('window:minimize',()=>win!.minimize())
 register('window:toggleMaximize',()=>{if(win!.isMaximized())win!.unmaximize();else win!.maximize()})
 register('window:close',()=>win!.close())
 register('window:isMaximized',()=>win!.isMaximized())
 register('categories:list',()=>listCategories())
 register('categories:save',(a:unknown)=>saveCategory(categoryInput.parse(a)))
 register('categories:remove',(a:unknown)=>removeCategory(text.parse(a)))
 register('categories:reorder',(a:unknown)=>reorderCategories(order.parse(a)))
 register('tools:list',()=>listTools())
 register('tools:save',(a:unknown)=>saveTool(toolInput.parse(a)))
 register('tools:remove',(a:unknown)=>removeTool(text.parse(a)))
 register('tools:reorder',(a:unknown)=>{const input=z.object({categoryId:text,ids:order}).parse(a);return reorderTools(input.categoryId,input.ids)})
 register('settings:get',()=>getSettings())
 register('settings:set',(a:unknown)=>{
  const {key,value}=z.object({key:z.enum(['theme','motion','showDefaultTag','allowHttp','sidebarWidth']),value:z.unknown()}).parse(a)
  if(key==='theme'&&!['dark','light'].includes(String(value)))throw Error('无效主题')
  if(key==='motion'&&!['normal','reduced','off'].includes(String(value)))throw Error('无效动画偏好')
  if(['allowHttp','showDefaultTag'].includes(key)&&typeof value!=='boolean')throw Error('无效布尔设置')
  if(key==='sidebarWidth'&&(typeof value!=='number'||value<200||value>440))throw Error('侧栏宽度超出范围')
  return putSetting(key,value as never)
 })
 register('views:open',(a:unknown)=>openWebview(win!,text.parse(a)))
 register('views:bounds',(a:unknown)=>setWebBounds(dimensions.parse(a)))
 register('views:hide',()=>hideWebview(win!))
 register('views:show',()=>showWebview(win!))
 register('views:reload',()=>reloadWebview())
 register('views:clearData',(id:unknown)=>clearWebData(win!,text.parse(id)))
 register('data:info',()=>getDataInfo())
 register('data:choose',()=>chooseDataFolder(win!))
 register('data:migrate',(a:unknown)=>migrateData(win!,z.string().min(3).max(1024).parse(a)))
 register('data:deleteOld',(a:unknown)=>deleteOldData(text.parse(a)))
 register('data:openFolder',()=>openDataFolder())
 register('data:backup',()=>backupData(win!))
 register('data:restore',()=>restoreData(win!))
 register('data:exportLogs',()=>exportLogs(win!))
 register('data:clearLogs',()=>clearLogs())
 register('data:restart',()=>{app.relaunch();app.quit()})
 register('crypto:rsa',(a:unknown)=>{const x=z.object({bits:z.number().int(),passphrase:z.string().max(200).optional()}).parse(a);return generateRsa(x.bits,x.passphrase)})
 register('crypto:ssh',(a:unknown)=>{const x=z.object({kind:z.enum(['ed25519','rsa']),bits:z.number().int(),comment:z.string().max(100),passphrase:z.string().max(200).optional()}).parse(a);return generateSsh(x.kind,x.bits,x.comment,x.passphrase)})
 register('crypto:aes',(a:unknown)=>generateAes(z.union([z.literal(128),z.literal(256)]).parse(a)))
 register('crypto:random',(a:unknown)=>{const x=z.object({length:z.number().int(),alphabet:z.string().min(2).max(2048)}).parse(a);return generateRandom(x.length,x.alphabet)})
}
function createWindow(){
 let saved: {width?:number;height?:number;x?:number;y?:number;maximized?:boolean}={}
 try{saved=JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch{}
 const bounds:{width:number;height:number;x?:number;y?:number}={width:Math.max(900,saved.width||1260),height:Math.max(600,saved.height||820)}
 if(Number.isFinite(saved.x)&&Number.isFinite(saved.y)){
  const display=screen.getAllDisplays().find(d=>saved.x! >= d.workArea.x-100 && saved.y! >= d.workArea.y-100 && saved.x! < d.workArea.x+d.workArea.width-100 && saved.y! < d.workArea.y+d.workArea.height-100)
  if(display){bounds.x=saved.x;bounds.y=saved.y}
 }
 win=new BrowserWindow({
  ...bounds,minWidth:880,minHeight:560,show:false,frame:false,autoHideMenuBar:true,backgroundColor:'#15171d',
  webPreferences:{preload:path.join(__dirname,'../preload/index.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
 })
 const w=win
 const save=()=>{if(w.isDestroyed())return;const b=w.getNormalBounds();fs.writeFileSync(stateFile,JSON.stringify({...b,maximized:w.isMaximized()}))}
 w.on('resize',()=>{if(!w.isMaximized())save()})
 w.on('move',()=>{if(!w.isMaximized())save()})
 w.on('maximize',save);w.on('unmaximize',save)
 w.on('close',()=>{save();removeWebview(w)})
 w.on('closed',()=>{win=null})
 w.webContents.setWindowOpenHandler(()=>({action:'deny'}))
 w.webContents.on('will-navigate',e=>e.preventDefault())
 w.once('ready-to-show',()=>{w.show();if(saved.maximized)w.maximize()})
 if(devMode&&process.env.ELECTRON_RENDERER_URL)w.loadURL(process.env.ELECTRON_RENDERER_URL)
 else w.loadFile(path.join(__dirname,'../renderer/index.html'))
 if(devMode)w.webContents.openDevTools({mode:'detach'})
}
app.whenReady().then(()=>{
 try{initStore();initMarker();initLog();recordEvent('app-start');channels();createWindow()}
 catch(e){dialog.showErrorBox('ToolDock 初始化失败',e instanceof Error?e.stack||e.message:String(e));app.quit()}
})
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',()=>{if(!closing){closing=true;try{closeStore()}catch{}}})
