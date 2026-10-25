import { BrowserWindow, WebContentsView, session } from 'electron'
import path from 'node:path'
import { getDataRoot, getSettings, listTools } from '../database/store'
let active:WebContentsView|null=null
let bound={x:252,y:48,width:800,height:600}
let currentTool=''
let showing=true
const isLoopback=(u:URL)=>['localhost','127.0.0.1','[::1]'].includes(u.hostname)
export function allowedUrl(raw:string):boolean {
 try {const u=new URL(raw);if(u.username||u.password)return false
  return u.protocol==='https:' || (u.protocol==='http:'&&(isLoopback(u)||getSettings().allowHttp))
 }catch{return false}
}
export function removeWebview(win:BrowserWindow) {
 if(active){try{win.contentView.removeChildView(active)}catch{};active.webContents.close();active=null}
 currentTool=''
}
export function hideWebview(win:BrowserWindow) {showing=false;if(active)try{win.contentView.removeChildView(active)}catch{}}
export function showWebview(win:BrowserWindow) {showing=true;if(active){win.contentView.addChildView(active);active.setBounds(bound)}}
export function setWebBounds(rect:typeof bound) {
 const w=Math.max(0,Math.round(rect.width)),h=Math.max(0,Math.round(rect.height))
 bound={x:Math.max(0,Math.round(rect.x)),y:Math.max(0,Math.round(rect.y)),width:w,height:h}
 if(active)active.setBounds(bound)
}
const status=(win:BrowserWindow,status:string,message?:string)=>{if(!win.isDestroyed())win.webContents.send('view:status',{status,message})}
export async function openWebview(win:BrowserWindow,id:string) {
 const tool=listTools().find(x=>x.id===id&&x.type==='link')
 if(!tool)throw Error('网页工具不存在')
 if(!allowedUrl(tool.target))throw Error('此链接被 HTTP 安全策略禁止，请在设置中允许 HTTP')
 if(active&&currentTool===id){showWebview(win);return}
 removeWebview(win)
 currentTool=id
 const ses=session.fromPath(path.join(getDataRoot(),'profiles',id))
 const view=new WebContentsView({webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,javascript:true,devTools:false}})
 active=view
 view.setBackgroundColor('#15171d')
 view.setBounds(bound)
 view.webContents.setWindowOpenHandler(({url})=>{if(allowedUrl(url))view.webContents.loadURL(url).catch(()=>{});return {action:'deny'}})
 let failed=false
 view.webContents.on('will-navigate',(event,url)=>{if(!allowedUrl(url)){event.preventDefault();failed=true;status(win,'error','已拦截不安全的网页跳转')}})
 view.webContents.on('will-redirect',(event,url)=>{if(!allowedUrl(url)){event.preventDefault();failed=true;status(win,'error','已拦截不安全的网页重定向')}})
 view.webContents.on('did-start-loading',()=>{failed=false;status(win,'loading')})
 // 加载失败后不能用 did-stop-loading 的 ready 状态覆盖错误界面。
 view.webContents.on('did-stop-loading',()=>{if(!failed)status(win,'ready')})
 view.webContents.on('did-fail-load',(_e,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){failed=true;status(win,'error',description)}})
 view.webContents.on('render-process-gone',()=>{failed=true;status(win,'crashed','网页渲染进程异常退出')})
 view.webContents.on('will-attach-webview',e=>e.preventDefault())
 if(showing)win.contentView.addChildView(view)
 try{await view.webContents.loadURL(tool.target)}catch(e){status(win,'error',e instanceof Error?e.message:'网页加载失败')}
}
export async function prepareWebviewsForDataMove(win:BrowserWindow){
 if(active){
  const ses=active.webContents.session
  await ses.flushStorageData()
  removeWebview(win)
 }
}
export function reloadWebview(){if(active&&!active.webContents.isDestroyed())active.webContents.reload()}
export async function clearWebData(win:BrowserWindow,id:string){
 const tool=listTools().find(x=>x.id===id)
 if(!tool||tool.type!=='link')throw Error('只允许清理网页工具的会话')
 if(currentTool===id)removeWebview(win)
 const ses=session.fromPath(path.join(getDataRoot(),'profiles',id))
 await ses.clearStorageData()
 await ses.clearCache()
}
