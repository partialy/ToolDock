import {createServer,type IncomingMessage,type ServerResponse,type Server} from 'node:http'
import {createReadStream,createWriteStream,promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {pipeline} from 'node:stream/promises'
import {Readable} from 'node:stream'
import {EventEmitter} from 'node:events'
import {app,dialog,type BrowserWindow,Notification} from 'electron'
import * as yazl from 'yazl'
import {interfaces,isPrivateIpv4,safeFilename,sameSubnet} from './network'
import {LanAuth,receiveJson,sendJson} from './auth'
import type {DeviceInfo,IncomingFile,LanInterface,SharedFile,TransferPreferences,TransferSnapshot,TransferTask} from '../../../../src/shared/fileTransferModels'
import {TRANSFER_DEFAULTS} from '../../../../src/shared/fileTransferModels'
import {SharedTree} from './shared-tree'
import {saveShareHistory} from '../../database/file-transfer-history'
import {FilePool} from './pool'
import {MessagePool} from './messages'
import {getDb,getDataRoot} from '../../database/store'
type InternalShare=SharedFile&{file:string;rootId?:string}
type Upload=IncomingFile&{temp:string;owner:string;lastActive:number;relativeFolder:string;group:string;fd?:fs.FileHandle}
const GIB=1024**3
const HEADER={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'}
export class FileTransferService extends EventEmitter {
 private server:Server|null=null
 private sockets=new Set<import('node:net').Socket>()
 private auth:LanAuth|null=null
 private address:string|null=null
 private mask:string|null=null
 private port:number|null=null
 private shares=new Map<string,InternalShare>()
 private tree=new SharedTree(()=>new Map([...this.shares].map(([id,s])=>[id,{id,file:s.file,kind:s.kind,name:s.name}])))
 private archiveTickets=new Map<string,{ids:string[];owner:string;expires:number}>()
 private downloadRoots=new Map<string,Set<string>>()
 private uploads=new Map<string,Upload>()
 private tasks=new Map<string,TransferTask>()
 private tempRoot:string|null=null
 private pool=new FilePool(()=>this.emitChange())
 private messages=new MessagePool(()=>this.emitChange())
 private poolDownloadIds=new Map<string,string>()
 private subscribers=new Set<ServerResponse>()
 private revision=0
 private cleaning=false
 private timer:NodeJS.Timeout|null=null
 private pendingReservationBytes=0
 private activeDownloads=0
 private inProgressUploads=new Set<string>()
 private activeResponses=new Map<string,ServerResponse>()
 private downloadOwners=new Map<string,string>()
 private downloadShares=new Map<string,string>()
 private prefs:TransferPreferences={...TRANSFER_DEFAULTS}
 private window:BrowserWindow|null=null
 setWindow(win:BrowserWindow){this.window=win}
 getPrefs(){return {...this.prefs}}
 setPrefs(next:TransferPreferences){
  if(!Number.isSafeInteger(next.maxFileBytes)||next.maxFileBytes<0||next.maxFileBytes>500*GIB)throw Error('文件大小限额无效')
  if(!Number.isSafeInteger(next.maxTempBytes)||next.maxTempBytes<GIB||next.maxTempBytes<next.maxFileBytes||next.maxTempBytes>500*GIB)throw Error('临时容量限额无效')
  if(!Number.isInteger(next.maxUploads)||next.maxUploads<1||next.maxUploads>4||!Number.isInteger(next.maxDownloads)||next.maxDownloads<1||next.maxDownloads>8)throw Error('并发设置超出范围')
  if(next.tempDirectory&&(!path.isAbsolute(next.tempDirectory)||next.tempDirectory.startsWith('\\\\')))throw Error('临时目录必须是本地绝对路径')
  this.prefs={...next,receiveDirectory:next.receiveDirectory||this.prefs.receiveDirectory}
  this.emitChange()
  return this.getPrefs()
 }
 async chooseDirectory(win:BrowserWindow){
  const x=await dialog.showOpenDialog(win,{title:'选择接收文件目录',properties:['openDirectory','createDirectory']})
  if(x.canceled||!x.filePaths[0])return null
  const folder=path.resolve(x.filePaths[0])
  if(!(await fs.stat(folder)).isDirectory())throw Error('请选择有效的目录')
  await fs.access(folder)
  this.prefs.receiveDirectory=folder
  this.emitChange();return folder
 }
 getInterfaces(){return interfaces()}
 getSnapshot():TransferSnapshot{
  const url=this.server&&this.address&&this.port?'http://'+this.address+':'+this.port:null
  return {running:!!this.server,port:this.port,address:this.address,url,pin:this.auth?.pin||null,
   qrUrl:url&&this.auth?url+'/#token='+encodeURIComponent(this.auth.bootstrap):null,
   interfaces:interfaces(),shares:[...this.shares.values()].map(({file,...safe})=>({...safe,path:file})),incoming:[...this.uploads.values()].map(({temp,owner,lastActive,fd,...safe})=>safe),
   devices:this.auth?.list()||[],tasks:[...this.tasks.values()],prefs:this.getPrefs(),pool:{usedBytes:this.pool.usedBytes,reservedBytes:this.activeUploadBytes()+this.pendingReservationBytes,limitBytes:this.prefs.maxTempBytes,messageBytes:this.messages.usedBytes,fileCount:this.pool.itemCount,messageCount:this.messages.list().total}}
 }
 private emitChange(){this.emit('change');if(this.window&&!this.window.isDestroyed())this.window.webContents.send('transfer:changed',this.getSnapshot());const message='id: '+(++this.revision)+'\nevent: change\ndata: {}\n\n';for(const res of this.subscribers)try{res.write(message)}catch{this.subscribers.delete(res)}}
 listPool(parentId:string|null=null,cursor=0,search='',sort:'newest'|'oldest'|'name'|'size'='newest'){return this.pool.list(parentId,cursor,search,sort)}
 listMessages(after=0,limit=100){return this.messages.list(after,limit)}
 messageChunk(id:string,offset=0){return this.messages.chunk(id,offset)}
 messageSearch(id:string,q:string){return this.messages.search(id,q)}
 messageText(id:string){return this.messages.text(id)}
 async sendMessage(text:string){const chunks=(function*(){for(let i=0;i<text.length;i+=64*1024)yield Buffer.from(text.slice(i,i+64*1024))})();return this.messages.publish(Readable.from(chunks) as IncomingMessage,{deviceId:'host',deviceName:'主设备'})}
 async clearMessages(){await this.messages.clear()}
 async deleteMessages(ids:string[]){await this.messages.remove(ids)}
 private activeUploadBytes(){return [...this.uploads.values()].filter(u=>['uploading','paused'].includes(u.status)).reduce((n,u)=>n+u.size,0)}
 async addPoolSources(paths:string[]){
  return this.pool.addLocal(paths,async size=>{
   if(this.pool.usedBytes+this.pendingReservationBytes+this.activeUploadBytes()+size>this.prefs.maxTempBytes)throw Error('文件池配额不足')
   this.pendingReservationBytes+=size;this.emitChange()
   try{const disk=await fs.statfs(this.tempRoot!);if(disk.bavail*disk.bsize<size+2*GIB)throw Error('磁盘可用空间不足')}
   catch(e){this.pendingReservationBytes-=size;throw e}
   return ()=>{this.pendingReservationBytes-=size;this.emitChange()}
  })
 }
 async removePool(ids:string[]){
  for(const [task,poolId] of this.poolDownloadIds)if(ids.includes(poolId)){this.activeResponses.get(task)?.destroy()}
  return this.pool.remove(ids)
 }
 async clearPool(){
  for(const task of this.poolDownloadIds.keys())this.activeResponses.get(task)?.destroy()
  for(const upload of this.uploads.values())if(['uploading','paused'].includes(upload.status)){await fs.rm(upload.temp,{force:true}).catch(()=>{});upload.status='rejected'}
  await this.pool.clear();this.emitChange()
 }
 async savePool(win:BrowserWindow,ids:string[]){
  const result=await dialog.showOpenDialog(win,{title:'选择文件池保存目录',properties:['openDirectory','createDirectory']})
  if(result.canceled||!result.filePaths[0])return {cancelled:true}
  return this.pool.save(ids,result.filePaths[0])
 }
 async chooseTempDirectory(win:BrowserWindow){
  const result=await dialog.showOpenDialog(win,{title:'选择快传临时目录',properties:['openDirectory','createDirectory']})
  if(result.canceled||!result.filePaths[0])return null
  const value=path.resolve(result.filePaths[0]);if(!path.isAbsolute(value)||value.startsWith('\\\\'))throw Error('仅支持本地路径')
  this.setPrefs({...this.prefs,tempDirectory:value});return value
 }
 async chooseShares(win:BrowserWindow){
  const choice=await dialog.showOpenDialog(win,{title:'添加共享文件',properties:['openFile','multiSelections']})
  if(!choice.canceled)await this.addSources(choice.filePaths)
  return this.getSnapshot().shares
 }
 async chooseFolders(win:BrowserWindow){
  const choice=await dialog.showOpenDialog(win,{title:'添加共享文件夹',properties:['openDirectory','multiSelections']})
  if(!choice.canceled)await this.addSources(choice.filePaths)
  return this.getSnapshot().shares
 }
 async addSources(paths:string[]){
  const result={added:0,skipped:0,errors:[] as string[]}
  for(const supplied of paths){
   try{
    if(!path.isAbsolute(supplied)||supplied.startsWith('\\\\'))throw Error('仅支持本地绝对路径')
    const full=path.normalize(path.resolve(supplied)),st=await fs.lstat(full)
    if(st.isSymbolicLink())throw Error('不共享符号链接或 Junction')
    if(!st.isDirectory()&&!st.isFile())throw Error('不是普通文件或目录')
    const real=await fs.realpath(full)
    if(!real.toLocaleLowerCase().startsWith(path.parse(real).root.toLocaleLowerCase()))throw Error('无效路径')
    const kind=st.isDirectory()?'directory':'file'
    const already=[...this.shares.values()].some(s=>s.file.toLocaleLowerCase()===real.toLocaleLowerCase())
    if(!already&&this.shares.size>=500)throw Error('本次会话最多分享 500 项')
    if(!already){
     const entry:InternalShare={id:randomUUID(),file:real,name:path.basename(real),size:st.isFile()?st.size:0,mtimeMs:st.mtimeMs,status:'ready',kind}
     this.shares.set(entry.id,entry);result.added++
    }else result.skipped++
    saveShareHistory(getDb(),real,kind)
   }catch(e){result.errors.push(path.basename(supplied)+': '+String(e instanceof Error?e.message:e))}
  }
  this.emitChange();return result
 }
 async directory(parentId:string,cursor?:string){try{return await this.tree.list(parentId,Number(cursor||0))}catch(e){const root=this.tree.rootFor(parentId);if(root){const source=this.shares.get(root.id);if(source){source.status='missing';this.emitChange()}}throw e}}
 async directoryStats(id:string){return this.tree.stats(id)}
 removeShare(id:string){if(!this.shares.delete(id))throw Error('共享文件不存在');this.tree.removeRoot(id);for(const [task,roots] of this.downloadRoots)if(roots.has(id)){const t=this.tasks.get(task);if(t)t.status='cancelled';this.activeResponses.get(task)?.destroy()}for(const [task,shareId] of this.downloadShares)if(shareId===id){const t=this.tasks.get(task);if(t)t.status='cancelled';this.activeResponses.get(task)?.destroy()}this.archiveTickets.clear();this.emitChange()}
 revokeDevice(id:string){this.auth?.revoke(id);for(const u of this.uploads.values())if(u.owner===id&&u.status==='uploading')u.status='paused';for(const [task,owner] of this.downloadOwners)if(owner===id){this.activeResponses.get(task)?.destroy();this.downloadOwners.delete(task)}this.emitChange()}
 async cancelTask(id:string){
  if(this.activeResponses.has(id)){const t=this.tasks.get(id);if(t)t.status='cancelled';this.activeResponses.get(id)?.destroy();return}
  const u=this.uploads.get(id)
  if(!u||!['uploading','paused','pending'].includes(u.status))throw Error('此任务无法取消')
  if(this.inProgressUploads.has(id))throw Error('任务正在写入分片，请稍后重试')
  await fs.rm(u.temp,{force:true});u.status='rejected'
  const task=this.tasks.get(id);if(task)task.status='cancelled'
  this.emitChange()
 }
 private async cleanupExpired(){
  const now=Date.now()
  for(const [id,u] of this.uploads){
   if(['uploading','paused'].includes(u.status)&&now-u.lastActive>30*60_000){this.uploads.delete(id);await u.fd?.close().catch(()=>{});await fs.rm(u.temp,{force:true}).catch(()=>{})}
  }
  this.emitChange()
 }
 async cleanupAbandoned(){
  const bases=[os.tmpdir(),this.prefs.tempDirectory||path.join(getDataRoot(),'temp','file-transfer')]
  for(const folder of bases){
  const entries=await fs.readdir(folder,{withFileTypes:true}).catch(()=>[])
  for(const entry of entries){
   if(!entry.isDirectory()||!/^tooldock-transfer-[a-zA-Z0-9_-]{6,}$/.test(entry.name))continue
   const location=path.join(folder,entry.name)
   const marker=await fs.readFile(path.join(location,'.owner'),'utf8').catch(()=>'')
   let owner:{app?:string;pid?:number;start?:number}={}
   try{owner=JSON.parse(marker)}catch{continue}
   if(owner.app!=='ToolDock Transfer v1'||!Number.isInteger(owner.pid)||location===this.tempRoot)continue
   let alive=false
   try{process.kill(owner.pid!,0);alive=true}catch(e){if((e as NodeJS.ErrnoException).code!=='ESRCH')alive=true}
   if(!alive)await fs.rm(location,{recursive:true,force:true}).catch(()=>{})
  }
  }
 }
 async start(address:string){
  if(this.server)throw Error('服务器已经启动')
  const nic=interfaces().find(x=>x.address===address)
  if(!nic||!isPrivateIpv4(address))throw Error('必须选择可用的局域网 IPv4 地址')
  const base=this.prefs.tempDirectory||path.join(getDataRoot(),'temp','file-transfer')
  await fs.mkdir(base,{recursive:true})
  const temp=await fs.mkdtemp(path.join(base,'tooldock-transfer-'))
  await fs.writeFile(path.join(temp,'.owner'), JSON.stringify({app:'ToolDock Transfer v1',pid:process.pid,start:Date.now()}),'utf8')
  this.tempRoot=temp
  await this.pool.open(temp);await this.messages.open(temp)
  const auth=new LanAuth(),server=createServer((req,res)=>{void this.handle(req,res).catch(e=>{if(!res.headersSent)sendJson(res,500,{error:e instanceof Error?e.message:'服务器处理失败'});else res.destroy()})})
  server.on('connection',socket=>{this.sockets.add(socket);socket.on('close',()=>this.sockets.delete(socket))})
  server.headersTimeout=10_000;server.requestTimeout=120_000;server.keepAliveTimeout=8000;server.maxRequestsPerSocket=200
  try{
   await new Promise<void>((resolve,reject)=>{
    server.once('error',reject);server.listen(0,address,()=>{server.off('error',reject);resolve()})
   })
   const port=(server.address() as import('node:net').AddressInfo).port
   this.server=server;this.auth=auth;this.address=address;this.mask=nic.netmask;this.port=port
   this.timer=setInterval(()=>{void this.cleanupExpired();if(!interfaces().some(n=>n.address===address)){void this.stop()}},30000)
   this.timer.unref()
   this.emitChange();return this.getSnapshot()
  }catch(e){server.close();await this.pool.close();await this.messages.close();await fs.rm(temp,{recursive:true,force:true});this.tempRoot=null;throw e}
 }
 async stop(){
  if(this.cleaning)return
  this.cleaning=true
  if(this.timer)clearInterval(this.timer);this.timer=null
  const server=this.server;this.server=null
  this.auth?.clear();this.auth=null;this.address=null;this.mask=null;this.port=null
  for(const socket of this.sockets)socket.destroy();this.sockets.clear()
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
  for(const res of this.subscribers)res.end();this.subscribers.clear()
  for(const u of this.uploads.values())await u.fd?.close().catch(()=>{})
  this.uploads.clear();this.shares.clear();this.tree.clear();this.archiveTickets.clear();this.downloadRoots.clear();this.tasks.clear();this.inProgressUploads.clear();this.activeDownloads=0;this.activeResponses.clear();this.downloadOwners.clear();this.downloadShares.clear()
  await this.pool.close();await this.messages.close();this.poolDownloadIds.clear()
  if(this.tempRoot)await fs.rm(this.tempRoot,{recursive:true,force:true}).catch(()=>{})
  this.tempRoot=null;this.cleaning=false;this.emitChange()
 }

 async approve(id:string){
  const u=this.uploads.get(id)
  if(!u||u.status!=='pending')throw Error('文件还没有完成上传，不能批准')
  const folder=this.prefs.receiveDirectory
  if(!folder)throw Error('请先选择接收目录')
  const st=await fs.stat(folder);if(!st.isDirectory())throw Error('接收目录不可用')
  const free=await fs.statfs(folder)
  if(free.bavail*free.bsize<u.size+2*GIB)throw Error('接收磁盘可用空间不足')
  const original=safeFilename(u.name)
  const ext=path.extname(original),stem=original.slice(0,original.length-ext.length)
  const temp=path.join(folder,'.tooldock-incoming-'+randomUUID()+'.part')
  u.status='uploading';this.emitChange()
  try{
   await pipeline(createReadStream(u.temp),createWriteStream(temp,{flags:'wx',mode:0o600}))
   const fd=await fs.open(temp,'r');try{await fd.sync().catch(e=>{if(process.platform!=='win32'||(e as NodeJS.ErrnoException).code!=='EPERM')throw e})}finally{await fd.close()}
   const staged=await fs.stat(temp);if(staged.size!==u.size)throw Error('接收文件字节数不完整')
   let candidate='',committed=false
   for(let n=0;n<10000;n++){
    candidate=path.join(folder,n===0?original:stem+' ('+n+')'+ext)
    try{await fs.link(temp,candidate);committed=true;break}catch(e){
     if((e as NodeJS.ErrnoException).code==='EEXIST')continue
     throw e
    }
   }
   if(!committed)throw Error('接收目录存在太多重名文件')
   await fs.rm(temp,{force:true});await fs.rm(u.temp,{force:true})
   u.savedAs=path.basename(candidate);u.status='accepted';const task=this.tasks.get(u.id);if(task)task.status='accepted';this.emitChange()
   return {name:u.savedAs,id}
  }catch(e){await fs.rm(temp,{force:true}).catch(()=>{});u.status='pending';this.emitChange();throw e}
 }
 async reject(id:string){
  const u=this.uploads.get(id)
  if(!u||u.status!=='pending')throw Error('文件不处于待接收状态')
  u.status='rejected';await fs.rm(u.temp,{force:true});const task=this.tasks.get(u.id);if(task)task.status='rejected';this.emitChange()
 }
 async approveMany(ids:string[]){const results:unknown[]=[];for(const id of ids){try{results.push({id,ok:true,result:await this.approve(id)})}catch(e){results.push({id,ok:false,error:String(e)})}}return results}
 async rejectMany(ids:string[]){for(const id of ids)await this.reject(id)}
 private async readShare(id:string){
  const s=this.shares.get(id);if(!s)throw Error('共享文件不存在')
  const st=await fs.stat(s.file).catch(()=>null)
  if(!st||!st.isFile()){s.status='missing';this.emitChange();throw Error('源文件已不存在')}
  if(st.size!==s.size||st.mtimeMs!==s.mtimeMs){s.status='changed';this.emitChange();throw Error('源文件已经变化，请重新添加分享')}
  return s
 }
 private async readEntry(id:string):Promise<InternalShare>{
  const root=this.shares.get(id)
  if(root){if(root.kind!=='file')throw Error('文件夹不能直接按文件下载');return this.readShare(id)}
  const node=await this.tree.resolve(id,'file')
  return {id,name:path.basename(node.filepath),file:node.filepath,rootId:node.root.id,kind:'file',size:node.stat.size,mtimeMs:node.stat.mtimeMs,status:'ready'}
 }
 private async handle(req:IncomingMessage,res:ServerResponse){
  const ip=(req.socket.remoteAddress||'').replace(/^::ffff:/,'')
  const host=req.headers.host||''
  if(!this.address||!this.mask||!this.port||!sameSubnet(this.address,this.mask,ip)||host!==this.address+':'+this.port){
   return sendJson(res,403,{error:'拒绝非局域网请求'})
  }
  const method=req.method||'GET'
  const origin=req.headers.origin
  if(origin&&origin!=='http://'+host)return sendJson(res,403,{error:'Origin 不匹配'})
  const url=new URL(req.url||'/', 'http://'+host)
  const pathname=url.pathname
  const unsafe=['POST','PUT','DELETE','PATCH'].includes(method)
  if(unsafe&&(origin!=='http://'+host||req.headers['x-tooldock-request']!=='1'))
   return sendJson(res,403,{error:'拒绝跨站请求'})
  for(const [key,value] of Object.entries(HEADER))res.setHeader(key,value)
  if(method==='GET'&&(pathname==='/'||pathname==='/main.js'||pathname==='/style.css')){
   const file=pathname==='/'?'index.html':pathname.slice(1)
   const location=path.resolve(__dirname,'../mobile-transfer',file)
   const mime=file.endsWith('js')?'application/javascript; charset=utf-8':file.endsWith('css')?'text/css; charset=utf-8':'text/html; charset=utf-8'
   res.writeHead(200,{'Content-Type':mime,'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"})
   return void await pipeline(createReadStream(location),res).catch(()=>{res.destroy()})
  }
  if(method==='POST'&&pathname==='/api/auth'){
   const b=await receiveJson(req)
   if(!this.auth)return sendJson(res,503,{error:'服务未运行'})
   try{
    const device=this.auth.authorize(b.kind==='pin'?'pin':'token',String(b.value||''),ip,String(req.headers['user-agent']||'未知浏览器'))
    res.setHeader('Set-Cookie',this.auth.cookieFor(device.id))
    return sendJson(res,200,{ok:true,device})
   }catch(e){return sendJson(res,403,{error:String(e)})}
  }
  const device=this.auth?.identify(req)
  if(!device)return sendJson(res,401,{error:'请先输入访问码或扫描二维码授权'})
  if(method==='GET'&&pathname==='/api/status')return sendJson(res,200,{shares:this.prefs.allowDownload?this.getSnapshot().shares.map(({path,...safe})=>safe):[],uploadAllowed:this.prefs.allowPoolUpload,downloadAllowed:this.prefs.allowDownload,poolDownloadAllowed:this.prefs.allowPoolDownload,device,pool:this.getSnapshot().pool})
  if(method==='GET'&&pathname==='/api/events'){
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive'})
   res.write('event: connected\ndata: {}\n\n')
   this.subscribers.add(res)
   const keepalive=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n')},25000);keepalive.unref()
   req.on('close',()=>{this.subscribers.delete(res);clearInterval(keepalive)})
   return
  }
  if(method==='POST'&&pathname==='/api/device/name'){
   const b=await receiveJson(req,1024)
   const name=String(b.name||'').trim().slice(0,40)
   if(!name)return sendJson(res,400,{error:'设备名称不能为空'})
   this.auth?.rename(device.id,name);this.emitChange();return sendJson(res,200,{ok:true})
  }
  if(method==='GET'&&pathname==='/api/pool'){
   if(!this.prefs.allowPoolDownload)return sendJson(res,403,{error:'文件池下载未开启'})
   const parent=url.searchParams.get('parent'),offset=Number(url.searchParams.get('cursor')||'0')
   if(!Number.isSafeInteger(offset)||offset<0||offset>1e9)return sendJson(res,400,{error:'分页参数无效'})
   const sort=url.searchParams.get('sort')||'newest'
   if(!['newest','oldest','name','size'].includes(sort))return sendJson(res,400,{error:'排序参数无效'})
   const q=(url.searchParams.get('q')||'').slice(0,200)
   return sendJson(res,200,this.listPool(parent,offset,q,sort as 'newest'|'oldest'|'name'|'size'))
  }
  if((method==='GET'||method==='HEAD')&&pathname.startsWith('/api/pool/files/')){
   if(!this.prefs.allowPoolDownload)return sendJson(res,403,{error:'文件池下载未开启'})
   const id=pathname.slice('/api/pool/files/'.length)
   if(!/^[0-9a-f-]{36}$/i.test(id))return sendJson(res,400,{error:'无效文件 ID'})
   const f=this.pool.file(id)
   return this.download(req,res,{id,name:f.name,file:f.file,size:f.size,kind:'file',status:'ready',mtimeMs:0},device,true)
  }
  if(method==='POST'&&pathname==='/api/pool/archive'){
   if(!this.prefs.allowPoolDownload)return sendJson(res,403,{error:'文件池下载未开启'})
   const b=await receiveJson(req,256*1024)
   const ids=b.ids
   if(!Array.isArray(ids)||ids.length>20000||ids.some(x=>typeof x!=='string'||!/^[0-9a-f-]{36}$/i.test(x)))return sendJson(res,400,{error:'文件列表无效'})
   const ticket=randomUUID()
   this.archiveTickets.set(ticket,{ids,owner:device.id,expires:Date.now()+300000})
   return sendJson(res,201,{url:'/api/pool/archive/'+ticket})
  }
  if(method==='GET'&&pathname.startsWith('/api/pool/archive/')){
   if(!this.prefs.allowPoolDownload)return sendJson(res,403,{error:'文件池下载未开启'})
   const key=pathname.split('/').at(-1)!,ticket=this.archiveTickets.get(key)
   if(!ticket||ticket.owner!==device.id||ticket.expires<Date.now())return sendJson(res,404,{error:'ZIP 下载凭据无效'})
   this.archiveTickets.delete(key);return this.downloadPoolZip(res,device,ticket.ids)
  }
  if(method==='POST'&&pathname==='/api/pool/folders'){
   if(!this.prefs.allowPoolUpload)return sendJson(res,403,{error:'文件池上传未开启'})
   const b=await receiveJson(req,512*1024)
   const paths=b.paths,group=String(b.group||'')
   if(!Array.isArray(paths)||paths.length>20000||paths.some(x=>typeof x!=='string')||!/^[0-9a-f-]{36}$/i.test(group))return sendJson(res,400,{error:'目录参数无效'})
   this.pool.addFolders(paths,{deviceId:device.id,deviceName:device.name||device.agent},group)
   return sendJson(res,201,{ok:true})
  }
  if(method==='GET'&&pathname==='/api/messages')return sendJson(res,200,this.listMessages(Number(url.searchParams.get('after')||0)))
  if(method==='POST'&&pathname==='/api/messages'){
   const value=await this.messages.publish(req,{deviceId:device.id,deviceName:device.name||device.agent})
   return sendJson(res,201,value)
  }
  const messageMatch=/^\/api\/messages\/([0-9a-f-]{36})\/(text|chunk|search|download)$/.exec(pathname)
  if(method==='GET'&&messageMatch){
   const [,id,action]=messageMatch
   if(action==='chunk')return sendJson(res,200,await this.messageChunk(id,Number(url.searchParams.get('offset')||0)))
   if(action==='search')return sendJson(res,200,{hits:await this.messageSearch(id,url.searchParams.get('q')||'')})
   const value=this.messages.get(id)
   res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':action==='download'?"attachment; filename*=UTF-8''"+encodeURIComponent('tooldock-message-'+id+'.txt'):'inline','Cache-Control':'no-store'})
   if(value.file)return void await pipeline(createReadStream(value.file),res).catch(()=>res.destroy())
   res.end(value.text||'');return
  }
  if(method==='GET'&&pathname==='/api/tree'){
   if(!this.prefs.allowDownload)return sendJson(res,403,{error:'未开启下载权限'})
   const parent=url.searchParams.get('parent')||''
   const cursor=url.searchParams.get('cursor')||'0'
   if(!/^[0-9a-f-]{36}$/i.test(parent)||!/^\d{1,8}$/.test(cursor))return sendJson(res,400,{error:'目录参数无效'})
   const page=await this.directory(parent,cursor)
   return sendJson(res,200,page)
  }
  if(method==='POST'&&pathname==='/api/archive-selections'){
   if(!this.prefs.allowDownload)return sendJson(res,403,{error:'未开启下载权限'})
   const body=await receiveJson(req,1024*1024)
   const ids=body.ids
   if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id)))return sendJson(res,400,{error:'选中项无效'})
   // Preflight before issuing a ticket; errors can still occur if files change later.
   await this.tree.expandZip(ids)
   const ticket=randomUUID()
   this.archiveTickets.set(ticket,{ids,owner:device.id,expires:Date.now()+300000})
   return sendJson(res,201,{url:'/api/archives/'+ticket})
  }
  if(method==='GET'&&pathname.startsWith('/api/archives/')){
   if(!this.prefs.allowDownload)return sendJson(res,403,{error:'未开启下载权限'})
   const ticket=pathname.slice('/api/archives/'.length),saved=this.archiveTickets.get(ticket)
   if(!saved||saved.owner!==device.id||saved.expires<Date.now())return sendJson(res,404,{error:'压缩包下载链接无效或过期'})
   this.archiveTickets.delete(ticket)
   return this.downloadZip(res,device,saved.ids)
  }

  if(method==='GET'&&pathname==='/api/uploads')return sendJson(res,200,{uploads:this.getSnapshot().incoming.filter(u=>this.uploads.get(u.id)?.owner===device.id)})
  if(method==='POST'&&pathname==='/api/logout'){this.auth?.revoke(device.id);res.setHeader('Set-Cookie','tooldock_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return sendJson(res,200,{ok:true})}
  if((method==='GET'||method==='HEAD')&&pathname.startsWith('/api/files/')){
   if(!this.prefs.allowDownload)return sendJson(res,403,{error:'未开启下载权限'})
   const id=pathname.split('/')[3]
   const s=await this.readEntry(id)
   return this.download(req,res,s,device)
  }
  if(method==='GET'&&pathname==='/api/zip'){
   if(!this.prefs.allowDownload)return sendJson(res,403,{error:'未开启下载权限'})
   return this.downloadZip(res,device,url.searchParams.getAll('id'))
  }
  if(method==='POST'&&pathname==='/api/uploads'){
   if(!this.prefs.allowPoolUpload)return sendJson(res,403,{error:'文件池上传未开启'})
   const b=await receiveJson(req)
   const size=Number(b.size),name=String(b.name||'')
   if(!Number.isSafeInteger(size)||size<0||size>this.prefs.maxFileBytes||name.length>250)return sendJson(res,400,{error:'文件大小或名称无效'})
   const relativeFolder=String(b.relativeFolder||'').replace(/\\/g,'/')
   const group=String(b.group||'')
   if(relativeFolder&&(relativeFolder.split('/').some(x=>!x||x==='.'||x==='..'||x.length>250)||relativeFolder.split('/').length>32)||group&&!/^[0-9a-f-]{36}$/i.test(group))return sendJson(res,400,{error:'目录路径或批次无效'})
   const used=this.activeUploadBytes()+this.pool.usedBytes
   if(used+this.pendingReservationBytes+size>this.prefs.maxTempBytes)return sendJson(res,429,{error:'暂存空间配额已满'})
   if(this.uploads.size>=500)return sendJson(res,429,{error:'本次会话上传任务过多'})
   // Reserve synchronously before any await: simultaneous devices cannot overbook the quota.
   this.pendingReservationBytes+=size
   let temp=''
   const id=randomUUID()
   try{
    const disk=await fs.statfs(this.tempRoot!)
    if(disk.bavail*disk.bsize<size+this.pendingReservationBytes-size+2*GIB)return sendJson(res,507,{error:'暂存盘剩余空间不足'})
    temp=path.join(this.tempRoot!,id+'.part')
    await fs.writeFile(temp,Buffer.alloc(0),{flag:'wx',mode:0o600})
    this.uploads.set(id,{id,name:safeFilename(name),size,received:0,ip,status:'uploading',temp,owner:device.id,lastActive:Date.now(),relativeFolder,group})
   }catch(e){if(temp)await fs.rm(temp,{force:true}).catch(()=>{});throw e}
   finally{this.pendingReservationBytes-=size}
   this.tasks.set(id,{id,name:safeFilename(name),total:size,completed:0,direction:'upload',ip,status:'uploading'})
   this.emitChange();return sendJson(res,201,{id,offset:0})
  }
  const uploadMatch=/^\/api\/uploads\/([0-9a-f-]{36})(?:\/(complete))?$/.exec(pathname)
  if(uploadMatch){
   const u=this.uploads.get(uploadMatch[1])
   if(!u||u.owner!==device.id)return sendJson(res,404,{error:'上传任务不存在'})
   u.lastActive=Date.now()
   if(method==='GET'&&!uploadMatch[2])return sendJson(res,200,{id:u.id,offset:u.received,total:u.size,status:u.status})
   if(method==='DELETE'&&!uploadMatch[2]){
    if(u.status==='accepted')return sendJson(res,409,{error:'文件已接收'})
    if(this.inProgressUploads.has(u.id))return sendJson(res,409,{error:'分片正在写入，请在当前分片结束后取消'})
    await fs.rm(u.temp,{force:true});u.status='rejected';const task=this.tasks.get(u.id);if(task)task.status='cancelled';this.emitChange();return sendJson(res,200,{ok:true})
   }
   if(method==='POST'&&uploadMatch[2]){
    if(u.status!=='uploading'&&u.status!=='paused')return sendJson(res,409,{error:'状态不允许完成'})
    if(u.received!==u.size)return sendJson(res,409,{error:'文件未完全上传',offset:u.received})
    const poolId=await this.pool.publish(u.temp,u.name,u.size,{deviceId:u.owner,deviceName:device.name||device.agent},u.relativeFolder,u.group)
    u.status='accepted';const task=this.tasks.get(u.id);if(task)task.status='completed';this.emitChange()
    if(this.window&&!this.window.isDestroyed()&&!this.window.isFocused()&&Notification.isSupported())new Notification({title:'ToolDock 文件池新增文件',body:u.name+' 已进入文件池'}).show()
    return sendJson(res,200,{ok:true,status:'accepted',poolId})
   }
   if(method==='PUT'&&!uploadMatch[2]){
    if(u.status!=='uploading'&&u.status!=='paused')return sendJson(res,409,{error:'文件状态不允许写入'})
    if(this.inProgressUploads.has(u.id)||this.inProgressUploads.size>=this.prefs.maxUploads)return sendJson(res,429,{error:'上传并发已满，请稍后重试'})
    const offset=Number(url.searchParams.get('offset'))
    const length=Number(req.headers['content-length'])
    if(!Number.isSafeInteger(offset)||offset!==u.received||!Number.isSafeInteger(length)||length<1||length>8*1024**2||offset+length>u.size)
     return sendJson(res,409,{error:'分片偏移或长度无效',offset:u.received})
    const digest=String(req.headers['x-chunk-sha256']||'').toLowerCase()
    if(!/^[a-f0-9]{64}$/.test(digest))return sendJson(res,400,{error:'缺少有效 SHA-256'})
    this.inProgressUploads.add(u.id)
    try{
     const bytes:Buffer[]=[];let count=0
     for await(const part of req){const b=Buffer.from(part as Buffer);count+=b.length;if(count>length)throw Error('分片超出声明长度');bytes.push(b)}
     if(count!==length)throw Error('分片不完整')
     const data=Buffer.concat(bytes)
     if(createHash('sha256').update(data).digest('hex')!==digest)throw Error('分片 SHA-256 校验失败')
     const handle=await fs.open(u.temp,'r+')
     try{await handle.write(data,0,data.length,u.received);await handle.sync()}finally{await handle.close()}
     u.received+=length;u.status='uploading';const task=this.tasks.get(u.id);if(task)task.completed=u.received;this.emitChange()
     return sendJson(res,200,{offset:u.received})
    }finally{this.inProgressUploads.delete(u.id)}
   }
  }
  return sendJson(res,404,{error:'接口不存在'})
 }
 private async download(req:IncomingMessage,res:ServerResponse,s:InternalShare,device:DeviceInfo,fromPool=false){
  if(this.activeDownloads>=this.prefs.maxDownloads)return sendJson(res,429,{error:'下载队列繁忙'})
  const size=s.size
  if(size===0){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':0,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(safeFilename(s.name))});res.end();return}
  let start=0,end=size-1,status=200
  const range=req.headers.range
  if(range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range)
   if(!match)return sendJson(res,416,{error:'无效 Range'})
   start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]))
   end=match[2]&&match[1]?Number(match[2]):size-1
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end){res.setHeader('Content-Range','bytes */'+size);return sendJson(res,416,{error:'范围超出文件大小'})}
   end=Math.min(end,size-1);status=206
  }
  const name=encodeURIComponent(safeFilename(s.name))
  if(req.method==='HEAD'){
   res.writeHead(status,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+name,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(status===206?{'Content-Range':'bytes '+start+'-'+end+'/'+size}:{})});res.end();return
  }
  res.writeHead(status,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+name,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(status===206?{'Content-Range':'bytes '+start+'-'+end+'/'+size}:{})})
  this.activeDownloads++
  const id=randomUUID();this.tasks.set(id,{id,name:s.name,direction:'download',total:end-start+1,completed:0,status:'running',ip:device.ip});this.activeResponses.set(id,res);this.downloadOwners.set(id,device.id);this.downloadShares.set(id,s.rootId||s.id);if(fromPool)this.poolDownloadIds.set(id,s.id);this.emitChange()
  try{
   const stream=createReadStream(s.file,{start,end})
   stream.on('data',b=>{const t=this.tasks.get(id);if(t)t.completed+=(b as Buffer).length})
   await pipeline(stream,res)
   this.tasks.get(id)!.status='completed'
  }catch{const t=this.tasks.get(id);if(t)t.status='failed';res.destroy()}
  finally{this.activeDownloads--;this.activeResponses.delete(id);this.downloadOwners.delete(id);this.downloadShares.delete(id);this.poolDownloadIds.delete(id);this.emitChange()}
 }
 private async downloadZip(res:ServerResponse,device:DeviceInfo,selectedIds:string[]=[]){
  if(this.activeDownloads>=this.prefs.maxDownloads)return sendJson(res,429,{error:'下载队列繁忙'})
  if(selectedIds.length>10000||selectedIds.some(id=>!/^[0-9a-f-]{36}$/i.test(id)))return sendJson(res,400,{error:'所选文件列表无效'})
  const ids=selectedIds.length?[...new Set(selectedIds)]:[...this.shares.keys()]
  if(!ids.length)return sendJson(res,400,{error:'当前没有共享文件'})
  for(const id of ids)if(this.shares.get(id)?.kind==='file')await this.readShare(id)
  const plan=await this.tree.expandZip(ids)
  if(!plan.entries.length)return sendJson(res,400,{error:'没有可下载的项目'})
  const archive=new yazl.ZipFile()
  archive.on('error',()=>{})
  archive.outputStream.on('error',()=>{})
  const taskId=randomUUID()
  const task:TransferTask={id:taskId,name:'分享文件.zip',direction:'download',total:plan.total,completed:0,status:'running',ip:device.ip}
  const activeStreams=new Set<ReturnType<typeof createReadStream>>()
  const abort=()=>{for(const stream of activeStreams)stream.destroy();(archive.outputStream as import('node:stream').Readable).destroy()}
  for(const entry of plan.entries){
   const rel=entry.name.split(path.sep).join('/')
   const safeParts=rel.split('/').filter(Boolean).map(x=>safeFilename(x))
   const zipName=safeParts.join('/')+(entry.directory?'/':'')
   if(entry.directory){archive.addEmptyDirectory(zipName,{mtime:entry.mtime});continue}
   archive.addReadStreamLazy(zipName,{size:entry.size,mtime:entry.mtime,forceZip64Format:entry.size>=4*GIB},callback=>{
    void (async()=>{
     try{
      // Validate at actual stream open, not just when the archive was planned.
      const stat=await fs.lstat(entry.path)
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.size||Math.abs(stat.mtimeMs-entry.mtime.getTime())>1)throw Error('源文件在打包期间发生变化')
      const root=this.shares.get(entry.rootId)
      if(!root)throw Error('共享已撤销')
      const realRoot=await fs.realpath(root.file),real=await fs.realpath(entry.path)
      const diff=path.relative(realRoot,real)
      if(diff==='..'||diff.startsWith('..'+path.sep)||path.isAbsolute(diff))throw Error('文件路径越界')
      const stream=createReadStream(entry.path)
      activeStreams.add(stream)
      stream.on('data',b=>{task.completed=Math.min(task.total,task.completed+(b as Buffer).length)})
      stream.on('close',()=>activeStreams.delete(stream))
      callback(null,stream)
     }catch(e){try{callback(e,null as never)}catch{res.destroy()}}
    })()
   })
  }
  archive.end({forceZip64Format:true,comment:''})
  this.activeDownloads++
  this.tasks.set(taskId,task);this.activeResponses.set(taskId,res);this.downloadOwners.set(taskId,device.id);this.downloadRoots.set(taskId,plan.roots)
  res.once('close',abort)
  this.emitChange()
  res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':"attachment; filename=tooldock-shared.zip"})
  try{await pipeline(archive.outputStream,res);if(task.status==='running')task.status='completed'}
  catch{if(task.status==='running')task.status='failed';res.destroy()}
  finally{
   res.off('close',abort);abort();this.activeDownloads--;this.activeResponses.delete(taskId)
   this.downloadOwners.delete(taskId);this.downloadRoots.delete(taskId);this.emitChange()
  }
 }

 private async downloadPoolZip(res:ServerResponse,device:DeviceInfo,ids:string[]){
  if(this.activeDownloads>=this.prefs.maxDownloads)return sendJson(res,429,{error:'下载队列繁忙'})
  const selected=ids.length?ids:this.pool.rootIds()
  const entries=this.pool.entries(selected)
  const total=entries.reduce((n,x)=>n+(x.kind==='file'?x.size:0),0)
  if(total>200*GIB)return sendJson(res,413,{error:'单次 ZIP 下载上限为 200 GiB'})
  if(!entries.length)return sendJson(res,400,{error:'文件池为空'})
  const zip=new yazl.ZipFile(),taskId=randomUUID()
  const task:TransferTask={id:taskId,name:'文件池.zip',direction:'download',total,completed:0,status:'running',ip:device.ip}
  for(const entry of entries){
   const parts=entry.name.replace(/\\/g,'/').split('/').filter(Boolean).map(safeFilename)
   const name=parts.join('/')
   if(entry.kind==='directory'){zip.addEmptyDirectory(name+'/');continue}
   if(!entry.file)continue
   zip.addReadStreamLazy(name,{size:entry.size,forceZip64Format:entry.size>=4*GIB},done=>{
    const stream=createReadStream(entry.file!)
    stream.on('data',b=>{task.completed+=Buffer.byteLength(b)})
    done(null,stream)
   })
  }
  zip.end({forceZip64Format:true,comment:''})
  this.activeDownloads++;this.tasks.set(taskId,task);this.activeResponses.set(taskId,res);this.downloadOwners.set(taskId,device.id)
  this.emitChange()
  res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="tooldock-pool.zip"'})
  try{await pipeline(zip.outputStream,res);task.status='completed'}catch{task.status='failed';res.destroy()}
  finally{this.activeDownloads--;this.activeResponses.delete(taskId);this.downloadOwners.delete(taskId);this.emitChange()}
 }
}
export const fileTransfer=new FileTransferService()
