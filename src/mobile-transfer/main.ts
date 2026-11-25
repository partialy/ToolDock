import './style.css'
import {initPools} from './pools'
import {icon} from './icons'
import {toast} from './toast'
import {anchorNavigation,backNavigation,initNavigation,recordNavigation,type Crumb,type MobileTab,type NavState} from './navigation'

type Share={id:string;name:string;size:number;kind:'file'|'directory';rootId?:string;status:'ready'|'changed'|'missing'}
type Up={id:string;name:string;size:number;received:number;status:string}
type ByteRange=[number,number]
type Selection={key:string;file:File}
type TransferJob={id:string;confirmedBytes:number;file:File;relativeFolder:string;group:string;row:HTMLElement;button:HTMLButtonElement;paused:boolean;cancelled:boolean;running:boolean;finished:boolean;abortController:AbortController|null}
const CHUNK_SIZE=4*1024**2
const MAX_INFLIGHT_CHUNKS=5
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const human=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' B'
const selected=new Map<string,Selection>()
const selectedDownload=new Set<string>()
const jobs=new Map<string,TransferJob>()
const queued:TransferJob[]=[]
let visibleShares:Share[]=[],rootShares:Share[]=[],crumbs:Crumb[]=[],nextKey=0,active=0,uploadEnabled=false,maxUploadFiles=2
let mode:MobileTab='download'
let navReady=false
let treeSeq=0
const knownShares=new Map<string,Share>()
/** 所有操作错误统一走顶部轻提示，不再使用固定错误条。 */
const err=(message:string)=>{if(message)toast.error(message)}
const label=(status:string)=>({uploading:'上传中',paused:'已暂停',pending:'等待发布',accepted:'已进入文件池',rejected:'已取消',failed:'失败',cancelled:'已取消'} as Record<string,string>)[status]||status

const PIN_STORAGE_KEY='tooldock-transfer-pin-v1'
const DEVICE_STORAGE_KEY='tooldock-transfer-device-v1'
let currentPin=(()=>{try{return sessionStorage.getItem(PIN_STORAGE_KEY)||''}catch{return ''}})()
let deviceToken=(()=>{try{return sessionStorage.getItem(DEVICE_STORAGE_KEY)||''}catch{return ''}})()
function saveCredentials(pin:string,token:string){
 currentPin=pin;deviceToken=token
 try{sessionStorage.setItem(PIN_STORAGE_KEY,pin);if(token)sessionStorage.setItem(DEVICE_STORAGE_KEY,token)}catch{}
}
function clearCredentials(showLogin=true){
 currentPin='';deviceToken=''
 try{sessionStorage.removeItem(PIN_STORAGE_KEY);sessionStorage.removeItem(DEVICE_STORAGE_KEY)}catch{}
 if(showLogin){
  live?.close();live=null;online=false
  $('workspace').hidden=true;$('login').hidden=false
 }
}
function withPin(rawUrl:string):string{
 if(!currentPin)return rawUrl
 return rawUrl+(rawUrl.includes('?')?'&':'?')+'pin='+encodeURIComponent(currentPin)
}
function authHeaders():Record<string,string>{
 const headers:Record<string,string>={}
 if(currentPin)headers['X-ToolDock-Pin']=currentPin
 if(deviceToken)headers['X-ToolDock-Device']=deviceToken
 return headers
}
async function json(url:string,options:RequestInit={}):Promise<any>{
 const response=await fetch(url,{credentials:'same-origin',...options,headers:{'X-ToolDock-Request':'1',...authHeaders(),...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}})
 const value=await response.json()
 if(response.status===401&&url!=='/api/auth')clearCredentials(true)
 if(!response.ok)throw Error(value.error||'请求失败 '+response.status)
 return value
}
const post=(url:string,value:unknown)=>json(url,{method:'POST',body:JSON.stringify(value)})
const pools=initPools(json,post,err,{
 record:()=>recordNav(),
 back:()=>backNavigation(),
 backSteps:(steps:number)=>backNavigation(steps),
 withPin,
 authHeaders
})
const cacheKey='tooldock-pool-resume-v1'
function cacheRead():Record<string,{id:string;group:string;relativeFolder:string}>{try{return JSON.parse(sessionStorage.getItem(cacheKey)||'{}')}catch{return {}}}
function cacheWrite(data:Record<string,{id:string;group:string;relativeFolder:string}>){try{sessionStorage.setItem(cacheKey,JSON.stringify(data))}catch{}}
const signature=(file:File)=>file.name+'\0'+file.size+'\0'+file.lastModified+'\0'+(file.webkitRelativePath||'')
const rowIcon=(filename:string)=>{
 const wrap=document.createElement('div')
 const dot=filename.lastIndexOf('.')
 const ext=dot>0?filename.slice(dot+1).toLowerCase():''
 wrap.className='file-icon '+(ext==='pdf'?'pdf':/^(zip|rar|7z|tar|gz|apk|exe)$/.test(ext)?'archive':/^(jpg|jpeg|png|webp|gif|svg|heic)$/.test(ext)?'image':/^(mp4|mkv|mov|avi)$/.test(ext)?'video':'')
 const extension=document.createElement('span');extension.className='file-extension';extension.textContent=ext?ext.toUpperCase():'FILE'
 wrap.title=ext?ext.toUpperCase()+' 文件':'文件';wrap.setAttribute('aria-hidden','true')
 wrap.append(extension);return wrap
}
const fileDetails=(name:string,meta:string)=>{
 const info=document.createElement('div'),title=document.createElement('div'),subtitle=document.createElement('div')
 info.className='file-details'
 title.className='name';title.textContent=name
 subtitle.className='meta';subtitle.textContent=meta
 info.append(title,subtitle)
 return {info,subtitle}
}
const button=(text:string,mode='normal')=>{
 const b=document.createElement('button');b.type='button';b.className='mini-button'+(mode==='remove'?' remove':'');b.setAttribute('aria-label',text);b.title=text
 return b
}
function renderDeviceName(name?:string){
 const text='当前设备：'+(name||'未命名')
 document.querySelectorAll<HTMLElement>('[data-device-name]').forEach(node=>{node.textContent=text})
}
function currentPanel(next:MobileTab,refresh=true){
 mode=next
 $('panel-pool').hidden=next!=='pool';$('panel-download').hidden=next!=='download';$('panel-messages').hidden=next!=='messages'
 $('panel-upload').hidden=true
 for(const t of ['pool','download','messages'] as MobileTab[]){
  const tab=$<HTMLButtonElement>('tab-'+t)
  const active=t===next
  tab.classList.toggle('active',active)
  if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current')
 }
 if(refresh&&next==='pool')void pools.refreshPool().catch(e=>err(String(e)))
 if(refresh&&next==='messages')void pools.refreshMessages().catch(e=>err(String(e)))
}
function snapshot():NavState{return {tab:mode,shares:crumbs.map(item=>({...item})),pool:pools.snapshot()}}
function recordNav(){recordNavigation(snapshot())}
function anchorNav(){anchorNavigation(snapshot())}
async function applyShares(path:Crumb[]){
 const seq=++treeSeq
 crumbs=path.map(item=>({...item}))
 try{
  const next=crumbs.length?await loadPage(crumbs[crumbs.length-1].id):rootShares
  if(seq!==treeSeq)return
  visibleShares=next
 }catch(e){
  if(seq!==treeSeq)return
  crumbs=[];visibleShares=rootShares;err(String(e))
 }
 renderShares()
}
/** 手机返回按钮：按历史快照还原一级 tab、目录层级、上传抽屉与文本查看器。 */
async function applyNav(state:NavState){
 currentPanel(state.tab||'download',false)
 await applyShares(state.shares||[])
 await pools.restore(state.pool||{trail:[],upload:false,viewer:null})
}
function renderDownloadSelection(){
 const matches=[...selectedDownload].map(id=>knownShares.get(id)).filter((s):s is Share=>Boolean(s&&s.status==='ready'))
 $('selection-summary').textContent=matches.length?'已选 '+matches.length+' 项 · 文件合计 '+human(matches.reduce((n,s)=>n+(s.kind==='file'?s.size:0),0)):'尚未选择文件'
 const ready=visibleShares.filter(s=>s.status==='ready')
 $('select-all').textContent=ready.length>0&&ready.every(s=>selectedDownload.has(s.id))?'取消全选':'全选当前目录'
 const selectedLink=$<HTMLAnchorElement>('download-selected')
 if(matches.length===1&&matches[0].kind==='file')selectedLink.href=withPin('/api/files/'+encodeURIComponent(matches[0].id))
 else if(matches.length)selectedLink.href='#'
 else selectedLink.removeAttribute('href')
 selectedLink.setAttribute('aria-disabled',String(!matches.length));selectedLink.tabIndex=matches.length?0:-1
 selectedLink.querySelector('span')!.textContent=matches.length?'下载所选 ('+matches.length+')':'下载所选文件'
 $('download-selection').hidden=!matches.length;$('selected-download-count').textContent=matches.length+' 项'
 const list=$('download-selected-list');list.replaceChildren()
 for(const f of matches){
  const chip=document.createElement('span');chip.className='chip'
  const name=document.createElement('span');name.textContent=f.name
  const remove=button('移除所选 '+f.name);remove.className='';remove.append(icon('close'))
  remove.onclick=()=>{selectedDownload.delete(f.id);renderShares()}
  chip.append(name,remove);list.append(chip)
 }
}
async function downloadArchive(ids:string[]){
 const ticket=await post('/api/archive-selections',{ids}) as {url:string}
 window.location.assign(withPin(ticket.url))
}
function renderBreadcrumbs(){
 const root=$('breadcrumbs');root.replaceChildren()
 const items=[{id:'',name:'分享文件'},...crumbs]
 items.forEach((part,i)=>{
  if(i){const arrow=document.createElement('span');arrow.textContent='›';arrow.className='crumb-separator';root.append(arrow)}
  const b=document.createElement('button');b.type='button';b.textContent=part.name;b.className='crumb'+(i===items.length-1?' current':'')
  // 面包屑向上导航复用历史后退，返回键与点击行为保持一致。
  b.onclick=()=>{const steps=crumbs.length-i;if(steps>0)backNavigation(steps)}
  root.append(b)
 })
}
async function browseAt(index:number){
 const seq=++treeSeq
 if(index<0){crumbs=[];visibleShares=rootShares;renderShares();return}
 const target=crumbs[index]
 const entries=await loadPage(target.id)
 // 返回键可能在上一次请求未完成时切换目录，过期结果直接丢弃。
 if(seq!==treeSeq)return
 crumbs=crumbs.slice(0,index+1);visibleShares=entries;renderShares()
}
async function loadPage(parentId:string){
 const items:Share[]=[];let cursor:string|null=null
 do{
  const q=new URLSearchParams({parent:parentId});if(cursor)q.set('cursor',cursor)
  const page=await json('/api/tree?'+q) as {items:Share[];nextCursor:string|null}
  items.push(...page.items);cursor=page.nextCursor
 }while(cursor&&items.length<20000)
 items.forEach(s=>knownShares.set(s.id,s))
 return items
}
async function openFolder(folder:Share){
 const seq=++treeSeq
 const entries=await loadPage(folder.id)
 if(seq!==treeSeq)return
 crumbs.push({id:folder.id,name:folder.name})
 visibleShares=entries;renderShares();recordNav()
}
function renderShares(){
 const container=$('shares');container.replaceChildren()
 renderBreadcrumbs()
 $('share-count').textContent=String(visibleShares.length)
 $<HTMLAnchorElement>('download-all').href=withPin('/api/zip')
 $('download-all').hidden=!rootShares.length
 if(!visibleShares.length){
  const empty=document.createElement('div');empty.className='empty'
  const graphic=document.createElement('div');graphic.className='empty-illustration';graphic.append(icon('file'))
  empty.append(graphic,Object.assign(document.createElement('span'),{textContent:crumbs.length?'当前文件夹为空':'电脑暂未分享文件'}));container.append(empty)
 }
 for(const file of visibleShares){
  const row=document.createElement('div');row.className='entry'
  const chosen=selectedDownload.has(file.id)
  const select=button((chosen?'取消选择 ':'选择 ')+file.name)
  select.className='checkmark'+(chosen?' selected':'');select.append(icon('check'))
  select.disabled=file.status!=='ready';select.setAttribute('aria-pressed',String(chosen))
  select.onclick=()=>{if(chosen)selectedDownload.delete(file.id);else selectedDownload.add(file.id);renderShares()}
  const link=document.createElement('a');link.className='download-button';link.href=file.kind==='directory'?'#':withPin('/api/files/'+encodeURIComponent(file.id))
  if(file.kind==='directory'){
   link.onclick=e=>{e.preventDefault();void downloadArchive([file.id]).catch(e=>err(String(e)))}
  }else link.download=file.name
  link.append(icon('download'))
  link.title='下载 '+file.name
  link.setAttribute('aria-label','下载 '+file.name)
  if(file.status!=='ready'){link.removeAttribute('href');link.setAttribute('aria-disabled','true')}
  const {info}=fileDetails(file.name,file.kind==='directory'?'文件夹 · 点击进入':human(file.size)+(file.status==='ready'?'':' · 文件不可用'))
  const open=document.createElement('button');open.type='button';open.className='file-browse'
  open.append(file.kind==='directory'?folderIcon():rowIcon(file.name),info)
  if(file.kind==='directory')open.onclick=()=>void openFolder(file).catch(e=>err(String(e)))
  else open.onclick=()=>{window.location.href=withPin('/api/files/'+encodeURIComponent(file.id))}
  row.append(select,open,link);container.append(row)
 }
 renderDownloadSelection()
}
function folderIcon(){
 const wrap=document.createElement('div');wrap.className='file-icon archive'
 wrap.textContent='DIR';wrap.setAttribute('aria-hidden','true');return wrap
}
function renderSelectedUploads(){
 const root=$('selected-upload-list');root.replaceChildren()
 const values=[...selected.values()]
 $('upload-selection').hidden=!values.length
 $('selected-upload-count').textContent=String(values.length)
 $('upload-total').textContent='合计 '+human(values.reduce((n,v)=>n+v.file.size,0))
 $('upload').toggleAttribute('disabled',!uploadEnabled||!values.length)
 for(const {key,file} of values){
  const row=document.createElement('div');row.className='entry'
  const {info}=fileDetails(file.name,human(file.size)+' · 待发送')
  const remove=button('移除 '+file.name,'remove');remove.append(icon('close'))
  remove.onclick=()=>{selected.delete(key);renderSelectedUploads()}
  row.append(rowIcon(file.name),info,remove);root.append(row)
 }
}
function addFiles(files:File[]){
 for(const file of files){
  const exists=[...selected.values()].some(item=>item.file.name===file.name&&item.file.size===file.size&&item.file.lastModified===file.lastModified)
  if(!exists)selected.set(String(++nextKey),{key:String(nextKey),file})
 }
 renderSelectedUploads();if(files.length)err('')
}
async function login(pinValue:string){
 const result=await post('/api/auth',{pin:pinValue,token:deviceToken||undefined}) as {ok:boolean;token?:string}
 saveCredentials(pinValue,result.token||deviceToken)
 history.replaceState(null,'',location.pathname)
 await enterWorkspace()
}
async function enterWorkspace(){
 $('login').hidden=true;$('workspace').hidden=false;err('')
 if(!navReady){navReady=true;initNavigation(state=>void applyNav(state))}
 currentPanel('download',false)
 await refresh()
 connectEvents()
}
async function refresh(){
 const status=await json('/api/status')
 renderDeviceName(status.device?.name)
 await pools.loadStatus(status)
 await pools.refreshMessages()
 rootShares=status.downloadAllowed?status.shares as Share[]:[]
 rootShares.forEach(s=>knownShares.set(s.id,{...s,rootId:s.id}))
 const visibleBefore=new Set(visibleShares.map(s=>s.id))
 if(crumbs.length){try{await browseAt(crumbs.length-1)}catch{crumbs=[];visibleShares=rootShares;renderShares()}}
 else{visibleShares=rootShares;renderShares()}
 const validRoots=new Set(rootShares.map(s=>s.id)),visibleAfter=new Set(visibleShares.map(s=>s.id))
 for(const id of selectedDownload){const entry=knownShares.get(id);if(!entry||!validRoots.has(entry.rootId||entry.id)||(visibleBefore.has(id)&&!visibleAfter.has(id)))selectedDownload.delete(id)}
 renderDownloadSelection()
 uploadEnabled=Boolean(status.uploadAllowed)
 if(typeof status.maxUploads==='number'&&status.maxUploads>=1&&status.maxUploads<=4)maxUploadFiles=status.maxUploads
 $('choose').toggleAttribute('disabled',!uploadEnabled)
 $('pick-files').toggleAttribute('disabled',!uploadEnabled)
 $('pick-folder').toggleAttribute('disabled',!uploadEnabled)
 $('pool-fab').toggleAttribute('disabled',!uploadEnabled)
 $('upload-hint').textContent=uploadEnabled?'传输完成后即进入共享文件池，所有设备都可下载':'主设备已关闭文件池上传权限'
 renderSelectedUploads()
 await syncUploads()
}
async function syncUploads(){
 const {uploads}=await json('/api/uploads') as {uploads:Up[]}
 for(const u of uploads){
  const job=jobs.get(u.id)
  if(!job||job.running)continue
  job.confirmedBytes=u.received
  const el=job.row
  const progress=el.querySelector('progress')
  if(progress){progress.max=u.size;progress.value=u.received}
  const status=el.querySelector<HTMLElement>('.meta')
  if(status){
   const suffix=label(u.status)
   status.textContent=human(u.received)+' / '+human(u.size)+' · '+suffix
  }
 }
}
/** 独立 Worker 池：将分片 SHA-256 计算移出主线程，并通过 Transferable 零拷贝传递缓冲区。 */
class HashWorkerPool{
 private workers:{worker:Worker;busy:number}[]=[]
 private pending=new Map<number,{resolve:(v:{digest:string;buffer:ArrayBuffer})=>void;reject:(e:Error)=>void;slot:{worker:Worker;busy:number}}>()
 private seq=0
 private ensure(){
  if(this.workers.length)return
  const count=Math.min(4,Math.max(2,Math.floor((navigator.hardwareConcurrency||4)/2)))
  for(let i=0;i<count;i++){
   const worker=new Worker('/hash-worker.js')
   const slot={worker,busy:0}
   worker.onmessage=(event:MessageEvent<{id:number;digest:string;buffer:ArrayBuffer}>)=>{
    const item=this.pending.get(event.data.id)
    if(!item)return
    this.pending.delete(event.data.id)
    item.slot.busy=Math.max(0,item.slot.busy-1)
    item.resolve({digest:event.data.digest,buffer:event.data.buffer})
   }
   worker.onerror=()=>{
    for(const [id,item] of this.pending){
     if(item.slot!==slot)continue
     this.pending.delete(id)
     slot.busy=Math.max(0,slot.busy-1)
     item.reject(Error('分片校验线程异常'))
    }
   }
   this.workers.push(slot)
  }
 }
 hash(buffer:ArrayBuffer,signal:AbortSignal):Promise<{digest:string;buffer:ArrayBuffer}>{
  if(signal.aborted)return Promise.reject(new DOMException('Aborted','AbortError'))
  this.ensure()
  let chosen=this.workers[0]
  for(const candidate of this.workers)if(candidate.busy<chosen.busy)chosen=candidate
  const id=++this.seq
  chosen.busy++
  return new Promise((resolve,reject)=>{
   const onAbort=()=>{
    const entry=this.pending.get(id)
    if(!entry)return
    this.pending.delete(id)
    entry.slot.busy=Math.max(0,entry.slot.busy-1)
    reject(new DOMException('Aborted','AbortError'))
   }
   signal.addEventListener('abort',onAbort,{once:true})
   this.pending.set(id,{
    slot:chosen,
    resolve:v=>{signal.removeEventListener('abort',onAbort);resolve(v)},
    reject:e=>{signal.removeEventListener('abort',onAbort);reject(e)}
   })
   chosen.worker.postMessage({id,buffer},[buffer])
  })
 }
}
const hashPool=new HashWorkerPool()
let inflightChunks=0
const chunkWaiters:Array<()=>void>=[]
async function acquireChunkSlot(signal:AbortSignal){
 if(signal.aborted)throw new DOMException('Aborted','AbortError')
 if(inflightChunks<MAX_INFLIGHT_CHUNKS){inflightChunks++;return}
 await new Promise<void>((resolve,reject)=>{
  const onAbort=()=>{
   const index=chunkWaiters.indexOf(grant)
   if(index>=0)chunkWaiters.splice(index,1)
   reject(new DOMException('Aborted','AbortError'))
  }
  const grant=()=>{signal.removeEventListener('abort',onAbort);resolve()}
  signal.addEventListener('abort',onAbort,{once:true})
  chunkWaiters.push(grant)
 })
}
function releaseChunkSlot(){
 const next=chunkWaiters.shift()
 if(next)next()
 else inflightChunks=Math.max(0,inflightChunks-1)
}
function mergeByteRange(ranges:ByteRange[],start:number,end:number):ByteRange[]{
 const next:ByteRange[]=[]
 let ms=start,me=end,inserted=false
 for(const [l,r] of ranges){
  if(r<ms){next.push([l,r]);continue}
  if(l>me){if(!inserted){next.push([ms,me]);inserted=true}next.push([l,r]);continue}
  ms=Math.min(ms,l);me=Math.max(me,r)
 }
 if(!inserted)next.push([ms,me])
 return next
}
const sumRanges=(ranges:readonly ByteRange[])=>ranges.reduce((n,[l,r])=>n+(r-l),0)
const isRangeCovered=(ranges:readonly ByteRange[],start:number,end:number)=>ranges.some(([l,r])=>l<=start&&r>=end)
function buildMissingChunks(totalSize:number,ranges:readonly ByteRange[],chunkSize:number):ByteRange[]{
 const chunks:ByteRange[]=[]
 let cursor=0
 for(const [left,right] of ranges){
  if(left>cursor){
   const stop=Math.min(left,totalSize)
   for(let p=cursor;p<stop;p+=chunkSize)chunks.push([p,Math.min(p+chunkSize,stop)])
  }
  cursor=Math.max(cursor,right)
  if(cursor>=totalSize)break
 }
 for(let p=cursor;p<totalSize;p+=chunkSize)chunks.push([p,Math.min(p+chunkSize,totalSize)])
 return chunks
}
function sleep(ms:number,signal:AbortSignal){
 return new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
  const timer=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve()},ms)
  const onAbort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))}
  signal.addEventListener('abort',onAbort,{once:true})
 })
}
const isAbortError=(e:unknown)=>e instanceof DOMException&&e.name==='AbortError'
/** 使用 XMLHttpRequest 发送分片以获得实时的 upload.onprogress 字节进度。 */
function putChunk(url:string,body:ArrayBuffer,digest:string,signal:AbortSignal,onProgress:(loaded:number)=>void){
 return new Promise<{status:number;data:any}>((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
  const xhr=new XMLHttpRequest()
  xhr.open('PUT',url)
  xhr.withCredentials=true
  xhr.setRequestHeader('X-ToolDock-Request','1')
  for(const [k,v] of Object.entries(authHeaders()))xhr.setRequestHeader(k,v)
  xhr.setRequestHeader('X-Chunk-SHA256',digest)
  xhr.setRequestHeader('Content-Type','application/octet-stream')
  const cleanup=()=>signal.removeEventListener('abort',onAbort)
  const onAbort=()=>xhr.abort()
  signal.addEventListener('abort',onAbort,{once:true})
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded)}
  xhr.onload=()=>{
   cleanup()
   let data:any={}
   try{data=xhr.responseText?JSON.parse(xhr.responseText):{}}catch{}
   resolve({status:xhr.status,data})
  }
  xhr.onerror=()=>{cleanup();reject(new TypeError('Network error'))}
  xhr.onabort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'))}
  xhr.send(body)
 })
}
function runQueue(){
 while(active<maxUploadFiles&&queued.length){
  const job=queued.shift()!
  if(job.cancelled||job.paused)continue
  active++
  void upload(job).finally(()=>{active--;runQueue()})
 }
}
function randomGroup(){const data=crypto.getRandomValues(new Uint8Array(16));data[6]=(data[6]&15)|64;data[8]=(data[8]&63)|128;const value=[...data].map(n=>n.toString(16).padStart(2,'0')).join('');return [value.slice(0,8),value.slice(8,12),value.slice(12,16),value.slice(16,20),value.slice(20)].join('-')}
function enqueue(files:File[]){
 const group=randomGroup()
 const cached=cacheRead()
 for(const file of files){
  const row=document.createElement('div');row.className='entry'
  const {info,subtitle}=fileDetails(file.name,'等待发送 · '+human(file.size))
  const progress=document.createElement('progress');progress.max=file.size;progress.value=0;info.append(progress)
  const pause=button('暂停 '+file.name);pause.textContent='暂停'
  const cancel=button('取消 '+file.name,'remove');cancel.append(icon('close'))
  const actions=document.createElement('div');actions.className='actions';actions.append(pause,cancel)
  row.append(rowIcon(file.name),info,actions);$('uploads').prepend(row)
  const relativeFolder=(file.webkitRelativePath||'').split('/').slice(0,-1).join('/')
  const previous=cached[signature(file)]
  const job:TransferJob={id:previous?.id||'',confirmedBytes:0,file,relativeFolder,group:previous?.group||group,row,button:pause,paused:false,cancelled:false,running:false,finished:false,abortController:null}
  pause.onclick=()=>{
   if(job.finished||job.cancelled)return
   job.paused=!job.paused;pause.textContent=job.paused?'继续':'暂停'
   if(job.paused)job.abortController?.abort()
   else if(!job.running&&!queued.includes(job)){queued.push(job);runQueue()}
  }
  cancel.onclick=()=>{
   job.cancelled=true;job.paused=true;job.abortController?.abort();row.remove()
   const data=cacheRead();delete data[signature(job.file)];cacheWrite(data)
   if(!job.running&&job.id)void json('/api/uploads/'+job.id,{method:'DELETE'}).catch(e=>err(String(e)))
  }
  queued.push(job);subtitle.textContent='已加入发送队列 · '+human(file.size)
 }
 runQueue()
}
async function upload(job:TransferJob){
 if(job.running||job.finished||job.cancelled||job.paused)return
 job.running=true
 const controller=new AbortController()
 job.abortController=controller
 const {file,row,button:pause}=job
 const meta=row.querySelector<HTMLElement>('.meta')!
 const bar=row.querySelector('progress')!
 try{
  let confirmedRanges:ByteRange[]=[]
  if(!job.id){
   const created=await post('/api/uploads',{name:file.name,size:file.size,relativeFolder:job.relativeFolder,group:job.group})
   job.id=created.id;jobs.set(job.id,job)
   const data=cacheRead();data[signature(file)]={id:job.id,group:job.group,relativeFolder:job.relativeFolder};cacheWrite(data)
   row.dataset.uploadId=job.id
  }else{
   try{
    const state=await json('/api/uploads/'+job.id)
    if(state.status==='accepted'){job.finished=true;return}
    confirmedRanges=Array.isArray(state.ranges)?state.ranges:(state.offset>0?[[0,state.offset]]:[])
   }catch{
    const created=await post('/api/uploads',{name:file.name,size:file.size,relativeFolder:job.relativeFolder,group:job.group})
    job.id=created.id;confirmedRanges=[]
    const data=cacheRead();data[signature(file)]={id:job.id,group:job.group,relativeFolder:job.relativeFolder};cacheWrite(data)
   }
   jobs.set(job.id,job)
   row.dataset.uploadId=job.id
  }
  job.confirmedBytes=sumRanges(confirmedRanges)
  bar.value=job.confirmedBytes
  const inflightLoaded=new Map<number,number>()
  let displayedPeak=job.confirmedBytes
  let lastUiUpdate=0
  const speedSamples:Array<{t:number;b:number}>=[{t:performance.now(),b:job.confirmedBytes}]
  const updateProgress=(force=false)=>{
   const now=performance.now()
   if(!force&&now-lastUiUpdate<100)return
   lastUiUpdate=now
   job.confirmedBytes=sumRanges(confirmedRanges)
   let inflightSum=0
   for(const [offset,loaded] of inflightLoaded){
    if(!isRangeCovered(confirmedRanges,offset,offset+1))inflightSum+=loaded
   }
   const totalNow=Math.min(file.size,job.confirmedBytes+inflightSum)
   displayedPeak=Math.max(displayedPeak,totalNow)
   bar.value=displayedPeak
   speedSamples.push({t:now,b:displayedPeak})
   while(speedSamples.length>2&&now-speedSamples[0].t>2500)speedSamples.shift()
   const elapsed=(now-speedSamples[0].t)/1000
   const rate=elapsed>0.15?(displayedPeak-speedSamples[0].b)/elapsed:0
   meta.textContent=human(displayedPeak)+' / '+human(file.size)+' · 上传中'+(rate>0?' · '+human(rate)+'/s':'')
  }
  if(job.confirmedBytes>0)updateProgress(true)
  const pendingChunks=buildMissingChunks(file.size,confirmedRanges,CHUNK_SIZE)
  let fatalError:unknown=null
  const workerCount=Math.min(MAX_INFLIGHT_CHUNKS,pendingChunks.length)
  const sendChunk=async(start:number,end:number)=>{
   const raw=await file.slice(start,end).arrayBuffer()
   if(controller.signal.aborted||job.paused||job.cancelled)return
   const {digest,buffer}=await hashPool.hash(raw,controller.signal)
   for(let attempt=0;attempt<=4;attempt++){
    if(job.paused||job.cancelled||controller.signal.aborted)return
    let retryDelay=0
    await acquireChunkSlot(controller.signal)
    try{
     const {status,data:result}=await putChunk('/api/uploads/'+job.id+'?offset='+start,buffer,digest,controller.signal,loaded=>{
      inflightLoaded.set(start,Math.min(end-start,loaded))
      updateProgress(false)
     })
     inflightLoaded.delete(start)
     if(status===429&&attempt<4){retryDelay=250*2**attempt}
     else if(status===409&&Array.isArray(result.ranges)){
      confirmedRanges=result.ranges
      if(isRangeCovered(confirmedRanges,start,end)){updateProgress(true);return}
      throw Error(result.error||'分片偏移冲突')
     }else if(status===401){
      clearCredentials(true)
      throw Error(result.error||'访问码已失效，请重新输入')
     }else if(status<200||status>=300){
      throw Error(result.error||'上传分片失败')
     }else{
      confirmedRanges=mergeByteRange(confirmedRanges,start,end)
      updateProgress(true)
      return
     }
    }catch(e){
     inflightLoaded.delete(start)
     if(isAbortError(e)||job.paused||job.cancelled)return
     if(attempt>=4||!(e instanceof TypeError))throw e
     retryDelay=250*2**attempt
    }finally{
     releaseChunkSlot()
    }
    if(retryDelay>0)await sleep(retryDelay,controller.signal)
   }
  }
  if(workerCount>0){
   await Promise.all(Array.from({length:workerCount},async()=>{
    while(!job.paused&&!job.cancelled&&!fatalError){
     const next=pendingChunks.shift()
     if(!next)break
     try{await sendChunk(next[0],next[1])}
     catch(e){
      if(!isAbortError(e)&&!job.paused&&!job.cancelled&&!fatalError){
       fatalError=e
       controller.abort()
      }
      break
     }
    }
   }))
  }
  if(fatalError&&!job.paused&&!job.cancelled)throw fatalError
  if(!job.paused&&!job.cancelled&&job.confirmedBytes===file.size){
   await post('/api/uploads/'+job.id+'/complete',{})
   job.finished=true;meta.textContent='已进入共享文件池'
   pause.disabled=true;pause.textContent='已完成'
   const data=cacheRead();delete data[signature(file)];cacheWrite(data)
   pools.scheduleRefresh()
  }else if(!job.cancelled)meta.textContent=human(job.confirmedBytes)+' / '+human(file.size)+' · 已暂停'
 }catch(e){
  if(!job.cancelled&&!isAbortError(e)){job.paused=true;pause.textContent='继续';meta.textContent='发送中断，可点击继续';err('发送 '+file.name+' 失败：'+String(e))}
 }finally{
  job.running=false
  if(job.abortController===controller)job.abortController=null
  if(job.cancelled&&job.id)await json('/api/uploads/'+job.id,{method:'DELETE'}).catch(()=>{})
  else if(!job.paused&&!job.finished&&!job.cancelled&&!queued.includes(job)){queued.push(job);runQueue()}
 }
}
$<HTMLAnchorElement>('download-selected').addEventListener('click',e=>{const selected=[...selectedDownload].map(id=>knownShares.get(id)).filter((x):x is Share=>Boolean(x));if(selected.length===1&&selected[0].kind==='file')return;e.preventDefault();if(selected.length)void downloadArchive(selected.map(x=>x.id)).catch(e=>err(String(e)))})
$('tab-download').addEventListener('click',()=>{currentPanel('download');anchorNav()})
$('tab-pool').addEventListener('click',()=>{currentPanel('pool');anchorNav()})
$('tab-messages').addEventListener('click',()=>{currentPanel('messages');anchorNav()})
$('pool-fab').addEventListener('click',()=>{if(!uploadEnabled)return;$('panel-upload').hidden=false;recordNav()})
$('upload-close').addEventListener('click',()=>backNavigation())
$('login-form').addEventListener('submit',e=>{e.preventDefault();void login(($<HTMLInputElement>('pin')).value).catch(e=>err(String(e)))})
$('refresh').addEventListener('click',()=>void refresh().catch(e=>err(String(e))))
$('select-all').addEventListener('click',()=>{
 const files=visibleShares.filter(s=>s.status==='ready')
 const all=files.length>0&&files.every(s=>selectedDownload.has(s.id))
 if(all)for(const item of files)selectedDownload.delete(item.id)
 else for(const item of files)selectedDownload.add(item.id)
 renderShares()
})
$('pick-files').addEventListener('click',()=>{if(uploadEnabled)$<HTMLInputElement>('choose').click()})
$('pick-folder').addEventListener('click',()=>{if(uploadEnabled)$<HTMLInputElement>('choose-folder').click()})
$('choose-folder').addEventListener('change',()=>{const input=$<HTMLInputElement>('choose-folder');addFiles([...(input.files||[])]);input.value=''})
$('choose').addEventListener('change',()=>{
 const input=$<HTMLInputElement>('choose')
 addFiles([...(input.files||[])])
 input.value=''
})
$('clear-selected').addEventListener('click',()=>{selected.clear();renderSelectedUploads()})
$('upload').addEventListener('click',()=>{
 const files=[...selected.values()].map(x=>x.file)
 if(!files.length||!uploadEnabled)return
 selected.clear();renderSelectedUploads();enqueue(files)
})
let live:EventSource|null=null
let everConnected=false,online=false
function connectEvents(){
 if(live)return
 live=new EventSource(withPin('/api/events'))
 live.addEventListener('change',()=>{pools.scheduleRefresh()})
 live.addEventListener('connected',()=>{
  if(everConnected&&!online)toast.success('已重新连接')
  everConnected=true;online=true
 })
 live.onerror=()=>{
  if(online){toast.warning('连接中断，正在重连…')}
  online=false
 }
}
const hashParams=new URLSearchParams(location.hash.slice(1))
const fragmentPin=hashParams.get('pin')||hashParams.get('token')
if(fragmentPin)void login(fragmentPin).catch(e=>{err(String(e));history.replaceState(null,'',location.pathname)})
else if(currentPin)void json('/api/status').then(()=>enterWorkspace()).catch(()=>{clearCredentials(true)})
setInterval(()=>{if(!$('workspace').hidden){void syncUploads().catch(()=>{});if(!live)connectEvents()}},3000)
setInterval(()=>{if(!$('workspace').hidden)void refresh().catch(()=>{})},15000)
