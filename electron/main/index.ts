import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { initStore, closeStore, listCategories, saveCategory, removeCategory, reorderCategories, listTools, saveTool, removeTool, reorderTools, getSettings, putSetting, getDataInfo, getDb } from './database/store'
import {listCodecPipelines,getCodecPipeline,createCodecPipeline,updateCodecPipeline,duplicateCodecPipeline,removeCodecPipeline} from './database/codec-pipelines'
import {pipelineInputSchema} from '../../src/shared/codecModels'
import {portSchema,killSchema,junctionSchema} from '../../src/shared/commandModels'
import {queryPort,terminatePortProcess} from './services/command-port'
import {previewJunction,createJunction} from './services/command-junction'
import { allowedUrl, openWebview, removeWebview, setWebBounds, hideWebview, showWebview, reloadWebview, clearWebData } from './views/webviews'
import { initMarker, chooseDataFolder, migrateData, deleteOldData, openDataFolder, backupData, restoreData } from './services/data'
import { generateRsa, generateSsh, generateEc, generateAes, generateRandom } from './services/crypto'
import { initLog, recordEvent, exportLogs, clearLogs } from './services/log'
import {beginFileExport,appendExportChunk,finishFileExport,cancelFileExport,disposeAllExports} from './services/file-export'
import {fileTransfer} from './services/transfer'
import {QuickLaunchService} from './services/quick-launch'
import {quickLaunchSaveSchema} from '../../src/shared/quickLaunchModels'
import {appIconPath,createAppTray} from './services/app-tray'

const devMode=!app.isPackaged
app.setName(devMode?'ToolDock-Dev':'ToolDock')
// Explicit test-only override: APPDATA alone is not sufficient for Electron app.getPath('appData').
if(devMode&&process.env.TOOLDOCK_E2E_APPDATA){const isolated=path.resolve(process.env.TOOLDOCK_E2E_APPDATA);fs.mkdirSync(isolated,{recursive:true});app.setPath('appData',isolated)}
const base=path.join(app.getPath('appData'),devMode?'ToolDock-Dev':'ToolDock')
fs.mkdirSync(base,{recursive:true})
app.setPath('userData',base)
const stateFile=path.join(base,'window.json')
let win:BrowserWindow|null=null
let closing=false
let shutdownComplete=false
let tray:ReturnType<typeof createAppTray>|null=null
function showMainWindow(){
 if(closing||!win||win.isDestroyed())return
 if(win.isMinimized())win.restore()
 win.show();win.focus()
}
const primaryInstance=app.requestSingleInstanceLock()
if(!primaryInstance)app.quit()
app.on('second-instance',showMainWindow)
const quickLaunch=new QuickLaunchService(()=>win)
const isMain=(event:Electron.IpcMainInvokeEvent)=>!!win&&!win.isDestroyed()&&event.sender===win.webContents
function register<T>(channel:string,fn:(arg:T)=>unknown|Promise<unknown>){ipcMain.handle(channel,async(e,arg:T)=>{if(!isMain(e))throw Error('不可信的 IPC 来源');try{return await fn(arg)}catch(e){recordEvent('ipc-failed:'+channel,'error');throw e}})}
const text=z.string().min(1).max(500)
const categoryInput=z.object({id:z.string().optional(),name:z.string().min(1).max(60),icon:z.string().max(80).optional(),visible:z.boolean().optional()})
const toolInput=z.object({id:z.string().optional(),name:z.string().min(1).max(80),icon:z.string().max(80).optional(),visible:z.boolean().optional(),categoryId:z.string(),type:z.enum(['link','internal']),target:z.string().max(2048)})
const order=z.array(z.string()).max(10000)
const dimensions=z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().finite().min(0).max(10000),height:z.number().finite().min(0).max(10000)})
function channels(){
 const appVersion=z.strictObject({id:z.uuid(),revision:z.number().int().positive()})
 register('quickLaunch:list',()=>quickLaunch.list())
 register('quickLaunch:tasks',()=>quickLaunch.tasks())
 register('quickLaunch:save',(a:unknown)=>quickLaunch.save(quickLaunchSaveSchema.parse(a)))
 register('quickLaunch:setVisible',(a:unknown)=>{const v=appVersion.extend({visible:z.boolean()}).parse(a);return quickLaunch.setVisible(v.id,v.revision,v.visible)})
 register('quickLaunch:remove',(a:unknown)=>{const v=appVersion.parse(a);return quickLaunch.remove(v.id,v.revision)})
 register('quickLaunch:reorderApps',(a:unknown)=>{const v=z.strictObject({groupId:z.string().min(1).max(60),ids:z.array(z.uuid()).max(1000)}).parse(a);return quickLaunch.reorderApps(v.groupId,v.ids)})
 register('quickLaunch:saveGroup',(a:unknown)=>{const v=z.strictObject({name:z.string().trim().min(1).max(60),id:z.union([z.uuid(),z.literal('ungrouped')]).optional()}).parse(a);return quickLaunch.saveGroup(v.name,v.id)})
 register('quickLaunch:removeGroup',(a:unknown)=>quickLaunch.removeGroup(z.union([z.uuid(),z.literal('ungrouped')]).parse(a)))
 register('quickLaunch:reorderGroups',(a:unknown)=>quickLaunch.reorderGroups(z.array(z.union([z.uuid(),z.literal('ungrouped')])).max(100).parse(a)))
 register('quickLaunch:chooseScript',(a:unknown)=>quickLaunch.chooseScript(z.enum(['powershell','cmd']).parse(a)))
 register('quickLaunch:chooseIcon',()=>quickLaunch.chooseIcon())
 register('quickLaunch:chooseWorkingDirectory',()=>quickLaunch.chooseWorkingDirectory())
 register('quickLaunch:openResources',(a:unknown)=>quickLaunch.openResources(z.uuid().parse(a)))
 register('quickLaunch:run',(a:unknown)=>{const v=appVersion.extend({confirmed:z.boolean()}).parse(a);return quickLaunch.run(v.id,v.revision,v.confirmed)})
 register('quickLaunch:task',(a:unknown)=>quickLaunch.task(z.uuid().parse(a)))
 register('quickLaunch:stop',(a:unknown)=>quickLaunch.stop(z.uuid().parse(a)))
 register('quickLaunch:reconcile',()=>quickLaunch.reconcile())
 register('quickLaunch:clearUnknown',(a:unknown)=>{const v=z.strictObject({id:z.uuid(),confirmed:z.boolean()}).parse(a);return quickLaunch.clearUnknown(v.id,v.confirmed)})
 register('commands:queryPort',(a:unknown)=>queryPort(portSchema.parse(a)))
 register('commands:terminate',(a:unknown)=>terminatePortProcess(killSchema.parse(a)))
 register('commands:chooseDirectory',async()=>{const result=await dialog.showOpenDialog(win!,{title:'选择目录',properties:['openDirectory']});return result.canceled?null:result.filePaths[0]||null})
 register('commands:validateJunction',(a:unknown)=>previewJunction(junctionSchema.parse(a)))
 register('commands:createJunction',(a:unknown)=>createJunction(junctionSchema.parse(a)))
 register('commands:openFolder',async(a:unknown)=>{
  const folder=z.string().min(3).max(1024).parse(a)
  if(!/^[a-zA-Z]:\\/.test(folder)||folder.startsWith('\\\\'))throw Error('仅允许打开本地绝对路径')
  if(!fs.statSync(folder,{throwIfNoEntry:false})?.isDirectory())throw Error('文件夹不存在')
  const error=await shell.openPath(folder)
  if(error)throw Error(error)
 })
 register('codecPipelines:list',()=>listCodecPipelines(getDb()))
 register('codecPipelines:get',(a:unknown)=>getCodecPipeline(getDb(),z.uuid().parse(a)))
 register('codecPipelines:create',(a:unknown)=>createCodecPipeline(getDb(),pipelineInputSchema.parse(a)))
 register('codecPipelines:update',(a:unknown)=>{const p=z.strictObject({id:z.uuid(),expectedRevision:z.number().int().positive(),data:pipelineInputSchema}).parse(a);return updateCodecPipeline(getDb(),p.id,p.expectedRevision,p.data)})
 register('codecPipelines:duplicate',(a:unknown)=>{const p=z.strictObject({id:z.uuid(),newName:z.string().max(80).optional()}).parse(a);return duplicateCodecPipeline(getDb(),p.id,p.newName)})
 register('codecPipelines:remove',(a:unknown)=>{const p=z.strictObject({id:z.uuid(),expectedRevision:z.number().int().positive().optional()}).parse(a);return removeCodecPipeline(getDb(),p.id,p.expectedRevision)})
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
  const {key,value}=z.object({key:z.enum(['theme','motion','showDefaultTag','allowHttp','sidebarWidth','notificationPosition','fileTransferPrefs','quickLaunchTrigger','quickLaunchStopOnExit']),value:z.unknown()}).parse(a)
  if(key==='quickLaunchTrigger'&&!['single','double'].includes(String(value)))throw Error('无效的快捷启动方式')
  if(key==='notificationPosition'&&!['top-left','top-right','bottom-left','bottom-right'].includes(String(value)))throw Error('通知位置无效')
  if(key==='fileTransferPrefs')throw Error('文件快传配置必须通过受限专用接口修改')
  if(key==='theme'&&!['dark','light'].includes(String(value)))throw Error('无效主题')
  if(key==='motion'&&!['normal','reduced','off'].includes(String(value)))throw Error('无效动画偏好')
  if(['allowHttp','showDefaultTag','quickLaunchStopOnExit'].includes(key)&&typeof value!=='boolean')throw Error('无效布尔设置')
  if(key==='sidebarWidth'&&(typeof value!=='number'||value<200||value>440))throw Error('侧栏宽度超出范围')
  return putSetting(key,value as never)
 })
 register('transfer:interfaces',()=>fileTransfer.getInterfaces())
 register('transfer:status',()=>fileTransfer.getSnapshot())
 register('transfer:start',(a:unknown)=>fileTransfer.start(z.ipv4().parse(a)))
 register('transfer:stop',()=>fileTransfer.stop())
 register('transfer:chooseShares',()=>fileTransfer.chooseShares(win!))
 register('transfer:removeShare',(a:unknown)=>fileTransfer.removeShare(z.string().uuid().parse(a)))
 register('transfer:chooseDirectory',async()=>{const folder=await fileTransfer.chooseDirectory(win!);if(folder){const p=fileTransfer.getPrefs();putSetting('fileTransferPrefs',p)}return folder})
 register('transfer:setPrefs',(a:unknown)=>{const next=z.object({allowDownload:z.boolean(),allowUpload:z.boolean(),maxFileBytes:z.number().int(),maxTempBytes:z.number().int(),maxUploads:z.number().int(),maxDownloads:z.number().int()}).parse(a);const p=fileTransfer.setPrefs({...fileTransfer.getPrefs(),...next});putSetting('fileTransferPrefs',p);return p})
 register('transfer:approve',(a:unknown)=>fileTransfer.approve(z.string().uuid().parse(a)))
 register('transfer:reject',(a:unknown)=>fileTransfer.reject(z.string().uuid().parse(a)))
 register('transfer:approveMany',(a:unknown)=>fileTransfer.approveMany(z.array(z.string().uuid()).max(200).parse(a)))
 register('transfer:rejectMany',(a:unknown)=>fileTransfer.rejectMany(z.array(z.string().uuid()).max(200).parse(a)))
 register('transfer:cancelTask',(a:unknown)=>fileTransfer.cancelTask(z.string().uuid().parse(a)))
 register('transfer:revokeDevice',(a:unknown)=>fileTransfer.revokeDevice(z.string().min(5).max(64).parse(a)))
 register('views:open',(a:unknown)=>openWebview(win!,text.parse(a)))
 register('views:bounds',(a:unknown)=>setWebBounds(dimensions.parse(a)))
 register('views:hide',()=>hideWebview(win!))
 register('views:show',()=>showWebview(win!))
 register('views:reload',()=>reloadWebview())
 register('views:clearData',(id:unknown)=>clearWebData(win!,text.parse(id)))
 register('data:info',()=>getDataInfo())
 register('data:choose',()=>chooseDataFolder(win!))
 register('data:migrate',(a:unknown)=>quickLaunch.dataMutation(()=>{if(fileTransfer.getSnapshot().running)throw Error('请先停止文件快传服务再迁移数据目录');return migrateData(win!,z.string().min(3).max(1024).parse(a))}))
 register('data:deleteOld',(a:unknown)=>quickLaunch.dataMutation(()=>deleteOldData(text.parse(a))))
 register('data:openFolder',()=>openDataFolder())
 register('data:backup',()=>quickLaunch.backup(()=>backupData(win!)))
 register('data:restore',()=>quickLaunch.dataMutation(()=>{if(fileTransfer.getSnapshot().running)throw Error('请先停止文件快传服务并处理待接收文件，再恢复数据备份');return restoreData(win!)}))
 register('data:exportLogs',()=>exportLogs(win!))
 register('data:clearLogs',()=>clearLogs())
 register('data:restart',()=>{app.relaunch();app.quit()})
 register('export:start',(a:unknown)=>{const v=z.object({name:z.string().min(1).max(128),format:z.enum(['zip','png','jpg','webp','gif','bmp','ico','txt','svg'])}).parse(a);return beginFileExport(win!,v.name,v.format)})
 register('export:chunk',(a:unknown)=>{const v=z.object({id:z.string().uuid(),bytes:z.instanceof(Uint8Array)}).parse(a);return appendExportChunk(v.id,v.bytes)})
 register('export:finish',(a:unknown)=>finishFileExport(z.string().uuid().parse(a)))
 register('export:cancel',(a:unknown)=>cancelFileExport(z.string().uuid().parse(a)))
 register('crypto:rsa',(a:unknown)=>{const x=z.object({bits:z.number().int(),passphrase:z.string().max(200).optional()}).parse(a);return generateRsa(x.bits,x.passphrase)})
 register('crypto:ssh',(a:unknown)=>{const x=z.object({kind:z.enum(['ed25519','rsa']),bits:z.number().int(),comment:z.string().max(100),passphrase:z.string().max(200).optional()}).parse(a);return generateSsh(x.kind,x.bits,x.comment,x.passphrase)})
 register('crypto:ec',(a:unknown)=>{const x=z.object({curve:z.enum(['P-256','P-384']),passphrase:z.string().max(200).optional()}).parse(a);return generateEc(x.curve,x.passphrase)})
 register('crypto:aes',(a:unknown)=>generateAes(z.union([z.literal(128),z.literal(256)]).parse(a)))
 register('crypto:random',(a:unknown)=>{const x=z.object({length:z.number().int(),alphabet:z.string().min(2).max(2048),groups:z.array(z.string().min(1).max(512)).max(4).optional()}).parse(a);return generateRandom(x.length,x.alphabet,x.groups||[])})
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
  ...bounds,minWidth:880,minHeight:560,show:false,frame:false,autoHideMenuBar:true,backgroundColor:'#15171d',icon:appIconPath(),
  webPreferences:{preload:path.join(__dirname,'../preload/index.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
 })
 const w=win
 const save=()=>{if(w.isDestroyed())return;const b=w.getNormalBounds();fs.writeFileSync(stateFile,JSON.stringify({...b,maximized:w.isMaximized()}))}
 w.on('resize',()=>{if(!w.isMaximized())save()})
 w.on('move',()=>{if(!w.isMaximized())save()})
 w.on('maximize',save);w.on('unmaximize',save)
 w.on('close',e=>{
  save()
  if(!closing&&tray&&!tray.isDestroyed()){e.preventDefault();w.hide();return}
  removeWebview(w)
 })
 w.on('closed',()=>{win=null})
 w.webContents.setWindowOpenHandler(()=>({action:'deny'}))
 w.webContents.on('will-navigate',e=>e.preventDefault())
 w.once('ready-to-show',()=>{w.show();if(saved.maximized)w.maximize()})
 if(devMode&&process.env.ELECTRON_RENDERER_URL)w.loadURL(process.env.ELECTRON_RENDERER_URL)
 else w.loadFile(path.join(__dirname,'../renderer/index.html'))
 if(devMode)w.webContents.openDevTools({mode:'detach'})
}
app.whenReady().then(async()=>{
 if(!primaryInstance)return
 try{app.setAppUserModelId('cn.partial.tooldock');initStore();initMarker();initLog();await quickLaunch.initialize();void fileTransfer.cleanupAbandoned();recordEvent('app-start');channels();createWindow();tray=createAppTray(showMainWindow);const prefs=getSettings().fileTransferPrefs;fileTransfer.setPrefs(prefs);if(win)fileTransfer.setWindow(win);fileTransfer.on('change',()=>{}); }
 catch(e){dialog.showErrorBox('ToolDock 初始化失败',e instanceof Error?e.stack||e.message:String(e));app.quit()}
})
app.on('window-all-closed',()=>{if(!tray||tray.isDestroyed())app.quit()})
app.on('before-quit',e=>{
 if(!primaryInstance||shutdownComplete)return
 e.preventDefault()
 if(closing)return
 closing=true
 const stopTasks=(()=>{try{return getSettings().quickLaunchStopOnExit}catch{return false}})()
 void Promise.allSettled([fileTransfer.stop(),quickLaunch.shutdown(stopTasks)]).finally(()=>{
  try{disposeAllExports();closeStore()}catch{}
  tray?.destroy();tray=null;shutdownComplete=true;app.quit()
 })
})
