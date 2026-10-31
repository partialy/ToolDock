import {BrowserWindow,dialog,nativeImage,shell as electronShell} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID} from 'node:crypto'
import {getDataRoot,getDb} from '../database/store'
import {QuickLaunchRepository} from '../database/quick-launch'
import {quickLaunchSaveSchema,type QuickLaunchApp,type QuickLaunchSave,type QuickLaunchResource} from '../../../src/shared/quickLaunchModels'
import {validateQuickLaunchImageHeader} from './quick-launch-image-header'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const managed=/^apps\/([0-9a-f-]{36})\/(script|icons)\/([0-9a-f-]{36})\.(ps1|bat|cmd|png)$/i
type Staged={kind:'script'|'icon';name:string;extension:string;bytes:Buffer;expires:number;shell?:'powershell'|'cmd'}

/** 原生选择器读入后仅短期保存在内存；渲染器无法提交本地读取路径。 */
export class QuickLaunchDataService {
 private readonly repository:QuickLaunchRepository
 private readonly staging=new Map<string,Staged>()
 constructor(private winProvider:()=>BrowserWindow|null,private assertUnlocked:(id:string)=>void){this.repository=new QuickLaunchRepository(getDb,assertUnlocked)}
 private root(){return path.join(getDataRoot(),'tools','quick-launch')}
 private ensureDirectory(dir:string){
  const base=path.resolve(getDataRoot()),rel=path.relative(base,dir)
  if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('资源目录越界')
  if(fs.lstatSync(base).isSymbolicLink())throw Error('数据目录不可为链接')
  let current=base
  for(const segment of rel.split(path.sep).filter(Boolean)){
   current=path.join(current,segment)
   if(!fs.existsSync(current))fs.mkdirSync(current)
   const stat=fs.lstatSync(current)
   if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('资源目录包含链接或非目录项')
  }
 }
 private resourcePath(rel:string,appId?:string){
  const match=managed.exec(rel)
  if(!match||!uuid.test(match[1])||!uuid.test(match[3])||(appId&&match[1]!==appId)||(match[2]==='icons'&&match[4]!=='png')||(match[2]==='script'&&match[4]==='png'))throw Error('非法托管资源引用')
  const dest=path.join(this.root(),...rel.split('/'))
  this.ensureDirectory(path.dirname(dest))
  if(fs.existsSync(dest)){
   const stat=fs.lstatSync(dest)
   if(!stat.isFile()||stat.isSymbolicLink()||path.resolve(fs.realpathSync(dest)).toLowerCase()!==path.resolve(dest).toLowerCase())throw Error('托管资源身份校验失败')
  }
  return dest
 }
 private readSelected(file:string,max:number){
  if(!path.isAbsolute(file)||file.startsWith('\\\\'))throw Error('请选择本地磁盘文件')
  let current=path.parse(file).root
  for(const segment of path.relative(current,file).split(path.sep)){
   current=path.join(current,segment)
   if(fs.lstatSync(current).isSymbolicLink())throw Error('不能导入符号链接或 Junction')
  }
  const stat=fs.lstatSync(file)
  if(!stat.isFile()||stat.size>max)throw Error(`文件必须为常规文件且不超过 ${max/1024/1024} MiB`)
  const fd=fs.openSync(file,'r')
  try{const opened=fs.fstatSync(fd);if(opened.ino!==stat.ino||opened.dev!==stat.dev||opened.size>max)throw Error('文件在读取期间发生变化');const bytes=fs.readFileSync(fd);if(bytes.length>max)throw Error('文件超出限制');return bytes}finally{fs.closeSync(fd)}
 }
 private stage(value:Staged):QuickLaunchResource{
  for(const [key,item] of this.staging)if(item.expires<Date.now())this.staging.delete(key)
  while(this.staging.size>=20)this.staging.delete(this.staging.keys().next().value!)
  const token=randomUUID();this.staging.set(token,value)
  return {token,name:value.name,...(value.kind==='icon'?{preview:'data:image/png;base64,'+value.bytes.toString('base64')}:{})}
 }
 private staged(token:string,kind:Staged['kind']){
  const value=this.staging.get(token)
  if(!value||value.kind!==kind||value.expires<Date.now())throw Error('所选文件已过期，请重新选择')
  return value
 }
 async chooseScript(shell:'powershell'|'cmd'){
  const win=this.winProvider();if(!win)throw Error('主窗口不可用')
  const result=await dialog.showOpenDialog(win,{title:'选择脚本（仅复制此文件，不复制相邻依赖）',properties:['openFile'],filters:[{name:'脚本',extensions:shell==='powershell'?['ps1']:['bat','cmd']}]})
  if(result.canceled)return null
  const file=result.filePaths[0],extension=path.extname(file).slice(1).toLowerCase()
  if(!(shell==='powershell'?['ps1']:['bat','cmd']).includes(extension))throw Error('脚本类型与执行环境不匹配')
  return this.stage({kind:'script',shell,name:path.basename(file),extension,bytes:this.readSelected(file,5*1024*1024),expires:Date.now()+15*60*1000})
 }
 private async rasterizeSvg(bytes:Buffer){
  const source=bytes.toString('utf8')
  const inspected=source.replace(/\sxmlns\s*=\s*(["'])http:\/\/www\.w3\.org\/2000\/svg\1/g,'').replace(/\sxmlns:xlink\s*=\s*(["'])http:\/\/www\.w3\.org\/1999\/xlink\1/g,'')
  // SVG 作为禁脚本、禁联网的 image 子资源解码；拒绝主动内容和所有外链，永不存储原 SVG。
  if(!/<svg[\s>]/i.test(source)||/<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|image|use|style|animate\w*|set)\b|\bon\w+\s*=|(?:href|src)\s*=|url\s*\(|@import|javascript:|https?:|file:/i.test(inspected))throw Error('SVG 包含不支持的主动内容或外部引用')
  const win=new BrowserWindow({show:false,width:256,height:256,useContentSize:true,backgroundColor:'#00000000',webPreferences:{partition:'quick-launch-icon-'+randomUUID(),sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false,webSecurity:true}})
  win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('data:')}))
  try{
   const html=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0;width:256px;height:256px;background:transparent}img{width:256px;height:256px;object-fit:contain}</style><img src="data:image/svg+xml;base64,${bytes.toString('base64')}">`
   await win.loadURL('data:text/html;base64,'+Buffer.from(html).toString('base64'))
   return (await win.webContents.capturePage()).toPNG()
  }finally{win.destroy()}
 }
 async chooseIcon(){
  const win=this.winProvider();if(!win)throw Error('主窗口不可用')
  const result=await dialog.showOpenDialog(win,{title:'选择图标（最大 2 MiB）',properties:['openFile'],filters:[{name:'图标',extensions:['png','jpg','jpeg','webp','svg']}]})
  if(result.canceled)return null
  const file=result.filePaths[0],ext=path.extname(file).toLowerCase(),raw=this.readSelected(file,2*1024*1024)
  let bytes:Buffer
  if(ext==='.svg')bytes=await this.rasterizeSvg(raw)
  else{
   validateQuickLaunchImageHeader(raw,ext)
   const image=nativeImage.createFromBuffer(raw),size=image.getSize()
   if(image.isEmpty()||size.width>8192||size.height>8192||size.width*size.height>32*1024*1024)throw Error('图标无效或尺寸过大')
   bytes=image.resize({width:256,height:256,quality:'good'}).toPNG()
  }
  return this.stage({kind:'icon',name:path.basename(file),extension:'png',bytes,expires:Date.now()+15*60*1000})
 }
 private write(appId:string,kind:'script'|'icons',staged:Staged){
  const rel=`apps/${appId}/${kind}/${randomUUID()}.${staged.extension}`,dest=this.resourcePath(rel,appId),tmp=dest+'.tmp'
  try{fs.writeFileSync(tmp,staged.bytes,{flag:'wx'});fs.renameSync(tmp,dest)}catch(error){try{fs.unlinkSync(tmp)}catch{};throw error}
  return rel
 }
 private cleanup(ref:string){
  try{const file=this.resourcePath(ref);if(fs.existsSync(file))fs.unlinkSync(file)}catch{
   try{this.ensureDirectory(this.root());const queue=path.join(this.root(),'cleanup.json');if(fs.existsSync(queue)&&fs.lstatSync(queue).isSymbolicLink())return
    let refs:string[]=[];try{const parsed:unknown=JSON.parse(fs.readFileSync(queue,'utf8'));if(Array.isArray(parsed))refs=parsed.filter((x):x is string=>typeof x==='string'&&managed.test(x))}catch{}
    fs.writeFileSync(queue,JSON.stringify([...new Set([...refs,ref])].slice(-10000)),{flag:'w'})
   }catch{}
  }
 }
 retryCleanup(){const file=path.join(this.root(),'cleanup.json');try{this.ensureDirectory(this.root());if(fs.lstatSync(file).isSymbolicLink())return;const refs:unknown=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(refs))return;fs.unlinkSync(file);const used=new Set(this.repository.listApps().flatMap(a=>[a.managedScript,a.iconKind==='managed'?a.iconValue:null]));refs.filter((r):r is string=>typeof r==='string'&&managed.test(r)&&!used.has(r)).forEach(r=>this.cleanup(r))}catch{}}
 listApps(){return this.repository.listApps().map(a=>this.hydrateIcon(a))}
 getApp(id:string){return this.repository.getApp(id)}
 listGroups(){return this.repository.listGroups()}
 hydrateIcon(item:QuickLaunchApp){
  if(item.iconKind!=='managed')return item
  try{const file=this.resourcePath(item.iconValue,item.id),stat=fs.statSync(file);if(stat.size>2*1024*1024)throw Error('图标过大');return {...item,iconDataUrl:'data:image/png;base64,'+fs.readFileSync(file).toString('base64')}}catch{return item}
 }
 async resolveScript(item:QuickLaunchApp){if(item.sourceKind!=='file'||!item.managedScript)throw Error('未配置托管脚本');const file=this.resourcePath(item.managedScript,item.id);if(!fs.existsSync(file)||fs.statSync(file).size>5*1024*1024)throw Error('托管脚本不存在或超出限制');return file}
 async save(raw:QuickLaunchSave){
  const input=quickLaunchSaveSchema.parse(raw),prev=input.id?this.repository.getApp(input.id):null,id=input.id??randomUUID(),d=input.data
  if(prev)this.assertUnlocked(id)
  const created:string[]=[]
  try{
   let script=d.sourceKind==='file'?prev?.managedScript??null:null,scriptName=d.sourceKind==='file'?prev?.scriptName??null:null,icon=d.iconKind==='managed'&&prev?.iconKind==='managed'?prev.iconValue:d.iconValue
   if(d.scriptToken){const staged=this.staged(d.scriptToken,'script');if(staged.shell!==d.shell)throw Error('脚本执行环境不匹配');script=this.write(id,'script',staged);scriptName=staged.name;created.push(script)}
   if(d.sourceKind==='file'&&script&&!((d.shell==='powershell'?['.ps1']:['.bat','.cmd']).includes(path.extname(script))))throw Error('托管脚本与执行环境不匹配')
   if(d.iconToken){if(d.iconKind!=='managed')throw Error('图标类型不匹配');icon=this.write(id,'icons',this.staged(d.iconToken,'icon'));created.push(icon)}
   if(d.iconKind==='managed'&&!d.iconToken&&!(prev?.iconKind==='managed'&&icon===prev.iconValue))throw Error('请选择托管图标')
   if(d.iconKind==='lucide'&&!/^[a-z0-9-]{1,80}$/.test(icon))throw Error('无效图标名称')
   const saved=this.repository.save(input,{id,managedScript:script,scriptName,iconValue:icon})
   if(d.scriptToken)this.staging.delete(d.scriptToken);if(d.iconToken)this.staging.delete(d.iconToken)
   for(const ref of [prev?.managedScript,prev?.iconKind==='managed'?prev.iconValue:null])if(ref&&ref!==saved.managedScript&&ref!==saved.iconValue)this.cleanup(ref)
   // 来源为内联时，任何误传的暂存脚本都不能成为孤立资源。
   created.filter(ref=>ref!==saved.managedScript&&ref!==saved.iconValue).forEach(ref=>this.cleanup(ref))
   return this.hydrateIcon(saved)
  }catch(error){created.forEach(ref=>this.cleanup(ref));throw error}
 }
 setVisible(id:string,revision:number,visible:boolean){this.repository.setVisible(id,revision,visible)}
 remove(id:string,revision:number){const item=this.repository.remove(id,revision);if(item.managedScript)this.cleanup(item.managedScript);if(item.iconKind==='managed')this.cleanup(item.iconValue)}
 reorderApps(groupId:string,ids:string[]){this.repository.reorderApps(groupId,ids)}
 saveGroup(name:string,id?:string){return this.repository.saveGroup(name,id)}
 removeGroup(id:string){this.repository.removeGroup(id)}
 reorderGroups(ids:string[]){this.repository.reorderGroups(ids)}
 async openResources(id:string){this.getApp(id);if(!uuid.test(id))throw Error('非法 App ID');const dir=path.join(this.root(),'apps',id);this.ensureDirectory(dir);const error=await electronShell.openPath(dir);if(error)throw Error(error)}
}
