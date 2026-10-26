import {createServer,type IncomingMessage,type ServerResponse,type Server} from 'node:http'
import {createReadStream,createWriteStream,promises as fs} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {pipeline} from 'node:stream/promises'
import {EventEmitter} from 'node:events'
import {app,dialog,type BrowserWindow,Notification} from 'electron'
import * as yazl from 'yazl'
import {interfaces,isPrivateIpv4,safeFilename,sameSubnet} from './network'
import {LanAuth,receiveJson,sendJson} from './auth'
import type {DeviceInfo,IncomingFile,LanInterface,SharedFile,TransferPreferences,TransferSnapshot,TransferTask} from '../../../../src/shared/fileTransferModels'
import {TRANSFER_DEFAULTS} from '../../../../src/shared/fileTransferModels'
type InternalShare=SharedFile&{file:string}
type Upload=IncomingFile&{temp:string;owner:string;lastActive:number;fd?:fs.FileHandle}
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
 private uploads=new Map<string,Upload>()
 private tasks=new Map<string,TransferTask>()
 private tempRoot:string|null=null
 private timer:NodeJS.Timeout|null=null
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
  if(!Number.isSafeInteger(next.maxFileBytes)||next.maxFileBytes<1024**2||next.maxFileBytes>50*GIB)throw Error('文件大小限额无效')
  if(!Number.isSafeInteger(next.maxTempBytes)||next.maxTempBytes<next.maxFileBytes||next.maxTempBytes>100*GIB)throw Error('临时容量限额无效')
  if(!Number.isInteger(next.maxUploads)||next.maxUploads<1||next.maxUploads>4||!Number.isInteger(next.maxDownloads)||next.maxDownloads<1||next.maxDownloads>8)throw Error('并发设置超出范围')
  if(next.allowUpload&&!next.receiveDirectory&&!this.prefs.receiveDirectory)throw Error('必须先选择接收目录才能开启上传')
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
   interfaces:interfaces(),shares:[...this.shares.values()].map(({file,...safe})=>safe),incoming:[...this.uploads.values()].map(({temp,owner,lastActive,fd,...safe})=>safe),
   devices:this.auth?.list()||[],tasks:[...this.tasks.values()],prefs:this.getPrefs()}
 }
 private emitChange(){this.emit('change');if(this.window&&!this.window.isDestroyed())this.window.webContents.send('transfer:changed',this.getSnapshot())}
 async chooseShares(win:BrowserWindow){
  const choice=await dialog.showOpenDialog(win,{title:'添加共享文件',properties:['openFile','multiSelections']})
  if(choice.canceled)return this.getSnapshot().shares
  for(const file of choice.filePaths){
   const real=await fs.realpath(file),st=await fs.stat(real)
   if(!st.isFile()||this.shares.size>=500)continue
   if([...this.shares.values()].some(s=>s.file===real))continue
   const entry:InternalShare={id:randomUUID(),file:real,name:path.basename(real),size:st.size,mtimeMs:st.mtimeMs,status:'ready'}
   this.shares.set(entry.id,entry)
  }
  this.emitChange();return this.getSnapshot().shares
 }
 removeShare(id:string){if(!this.shares.delete(id))throw Error('共享文件不存在');for(const [task,shareId] of this.downloadShares)if(shareId===id)this.activeResponses.get(task)?.destroy();this.emitChange()}
 revokeDevice(id:string){this.auth?.revoke(id);for(const u of this.uploads.values())if(u.owner===id&&u.status==='uploading')u.status='paused';for(const [task,owner] of this.downloadOwners)if(owner===id){this.activeResponses.get(task)?.destroy();this.downloadOwners.delete(task)}this.emitChange()}
 async cancelTask(id:string){
  if(this.activeResponses.has(id)){this.activeResponses.get(id)?.destroy();return}
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
  const folder=os.tmpdir()
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
 async start(address:string){
  if(this.server)throw Error('服务器已经启动')
  const nic=interfaces().find(x=>x.address===address)
  if(!nic||!isPrivateIpv4(address))throw Error('必须选择可用的局域网 IPv4 地址')
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'tooldock-transfer-'))
  await fs.writeFile(path.join(temp,'.owner'), JSON.stringify({app:'ToolDock Transfer v1',pid:process.pid,start:Date.now()}),'utf8')
  this.tempRoot=temp
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
  }catch(e){server.close();await fs.rm(temp,{recursive:true,force:true});this.tempRoot=null;throw e}
 }
 async stop(){
  if(this.timer)clearInterval(this.timer);this.timer=null
  const server=this.server;this.server=null
  this.auth?.clear();this.auth=null;this.address=null;this.mask=null;this.port=null
  for(const socket of this.sockets)socket.destroy();this.sockets.clear()
  if(server)await new Promise<void>(resolve=>server.close(()=>resolve()))
  for(const u of this.uploads.values())await u.fd?.close().catch(()=>{})
  this.uploads.clear();this.shares.clear();this.tasks.clear();this.inProgressUploads.clear();this.activeDownloads=0;this.activeResponses.clear();this.downloadOwners.clear();this.downloadShares.clear()
  if(this.tempRoot)await fs.rm(this.tempRoot,{recursive:true,force:true}).catch(()=>{})
  this.tempRoot=null;this.emitChange()
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
  if(method==='GET'&&pathname==='/api/status')return sendJson(res,200,{shares:this.prefs.allowDownload?this.getSnapshot().shares:[],uploadAllowed:this.prefs.allowUpload,downloadAllowed:this.prefs.allowDownload,device})
  if(method==='GET'&&pathname==='/api/uploads')return sendJson(res,200,{uploads:this.getSnapshot().incoming.filter(u=>this.uploads.get(u.id)?.owner===device.id)})
  if(method==='POST'&&pathname==='/api/logout'){this.auth?.revoke(device.id);res.setHeader('Set-Cookie','tooldock_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return sendJson(res,200,{ok:true})}
  if((method==='GET'||method==='HEAD')&&pathname.startsWith('/api/files/')){
   if(!this.prefs.allowDownload)return sendJson(res,403,{error:'未开启下载权限'})
   const id=pathname.split('/')[3]
   const s=await this.readShare(id)
   return this.download(req,res,s,device)
  }
  if(method==='GET'&&pathname==='/api/zip'){
   if(!this.prefs.allowDownload)return sendJson(res,403,{error:'未开启下载权限'})
   return this.downloadZip(res,device)
  }
  if(method==='POST'&&pathname==='/api/uploads'){
   if(!this.prefs.allowUpload||!this.prefs.receiveDirectory)return sendJson(res,403,{error:'电脑未开启接收权限'})
   const b=await receiveJson(req)
   const size=Number(b.size),name=String(b.name||'')
   if(!Number.isSafeInteger(size)||size<1||size>this.prefs.maxFileBytes||name.length>250)return sendJson(res,400,{error:'文件大小或名称无效'})
   const used=[...this.uploads.values()].filter(u=>!['accepted','rejected'].includes(u.status)).reduce((n,u)=>n+u.size,0)
   if(used+size>this.prefs.maxTempBytes)return sendJson(res,429,{error:'暂存空间配额已满'})
   const disk=await fs.statfs(this.tempRoot!)
   if(disk.bavail*disk.bsize<size+2*GIB)return sendJson(res,507,{error:'暂存盘剩余空间不足'})
   if(this.uploads.size>=500)return sendJson(res,429,{error:'本次会话上传任务过多'})
   const id=randomUUID(),temp=path.join(this.tempRoot!,id+'.part')
   await fs.writeFile(temp,Buffer.alloc(0),{flag:'wx',mode:0o600})
   this.uploads.set(id,{id,name:safeFilename(name),size,received:0,ip,status:'uploading',temp,owner:device.id,lastActive:Date.now()})
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
    u.status='pending';const task=this.tasks.get(u.id);if(task)task.status='pending';this.emitChange()
    if(this.window&&!this.window.isDestroyed()){
     this.window.webContents.send('transfer:pending',{id:u.id,name:u.name,size:u.size})
     if(!this.window.isFocused()&&Notification.isSupported())new Notification({title:'ToolDock 收到待接收文件',body:'有一个文件上传完成，等待你确认接收'}).show()
    }
    return sendJson(res,200,{ok:true,status:'pending'})
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
 private async download(req:IncomingMessage,res:ServerResponse,s:InternalShare,device:DeviceInfo){
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
  const id=randomUUID();this.tasks.set(id,{id,name:s.name,direction:'download',total:end-start+1,completed:0,status:'running',ip:device.ip});this.activeResponses.set(id,res);this.downloadOwners.set(id,device.id);this.downloadShares.set(id,s.id);this.emitChange()
  try{
   const stream=createReadStream(s.file,{start,end})
   stream.on('data',b=>{const t=this.tasks.get(id);if(t)t.completed+=(b as Buffer).length})
   await pipeline(stream,res)
   this.tasks.get(id)!.status='completed'
  }catch{const t=this.tasks.get(id);if(t)t.status='failed';res.destroy()}
  finally{this.activeDownloads--;this.activeResponses.delete(id);this.downloadOwners.delete(id);this.downloadShares.delete(id);this.emitChange()}
 }
 private async downloadZip(res:ServerResponse,device:DeviceInfo){
  if(this.activeDownloads>=this.prefs.maxDownloads)return sendJson(res,429,{error:'下载队列繁忙'})
  const shares=await Promise.all([...this.shares.keys()].map(id=>this.readShare(id)))
  if(!shares.length)return sendJson(res,400,{error:'当前没有共享文件'})
  this.activeDownloads++
  const archive=new yazl.ZipFile(),names=new Set<string>()
  for(const share of shares){
   const name=safeFilename(share.name),ext=path.extname(name),stem=name.slice(0,name.length-ext.length)
   let entry=name,i=1;while(names.has(entry.toLowerCase()))entry=stem+' ('+(i++)+')'+ext
   names.add(entry.toLowerCase())
   archive.addFile(share.file,entry,{compress:!/\.(zip|7z|rar|mp4|jpg|jpeg|png|webp|avi|mkv|exe|apk)$/i.test(entry),forceZip64Format:share.size>=4*GIB})
  }
  archive.end({forceZip64Format:true,comment:''})
  res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':"attachment; filename=tooldock-shared.zip"})
  const id=randomUUID();this.tasks.set(id,{id,name:'全部文件.zip',direction:'download',total:shares.reduce((n,v)=>n+v.size,0),completed:0,status:'running',ip:device.ip});this.activeResponses.set(id,res);this.downloadOwners.set(id,device.id);this.emitChange()
  archive.outputStream.on('data',b=>{const t=this.tasks.get(id);if(t)t.completed+=(b as Buffer).length})
  try{await pipeline(archive.outputStream,res);this.tasks.get(id)!.status='completed'}
  catch{const t=this.tasks.get(id);if(t)t.status='failed';res.destroy()}
  finally{this.activeDownloads--;this.activeResponses.delete(id);this.downloadOwners.delete(id);this.emitChange()}
 }
}
export const fileTransfer=new FileTransferService()
