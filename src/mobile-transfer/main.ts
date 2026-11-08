import './style.css'
import {sha256} from '@noble/hashes/sha2.js'
import {initPools} from './pools'
import {bytesToHex} from '@noble/hashes/utils.js'
import {icon} from './icons'
import {toast} from './toast'
import {anchorNavigation,backNavigation,initNavigation,recordNavigation,type Crumb,type MobileTab,type NavState} from './navigation'

type Share={id:string;name:string;size:number;kind:'file'|'directory';rootId?:string;status:'ready'|'changed'|'missing'}
type Up={id:string;name:string;size:number;received:number;status:string}
type Selection={key:string;file:File}
type TransferJob={id:string;offset:number;file:File;relativeFolder:string;group:string;row:HTMLElement;button:HTMLButtonElement;paused:boolean;cancelled:boolean;running:boolean;finished:boolean}
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const human=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' B'
const selected=new Map<string,Selection>()
const selectedDownload=new Set<string>()
const jobs=new Map<string,TransferJob>()
const queued:TransferJob[]=[]
let visibleShares:Share[]=[],rootShares:Share[]=[],crumbs:Crumb[]=[],nextKey=0,active=0,uploadEnabled=false
let mode:MobileTab='download'
let navReady=false
let treeSeq=0
const knownShares=new Map<string,Share>()
/** 所有操作错误统一走顶部轻提示，不再使用固定错误条。 */
const err=(message:string)=>{if(message)toast.error(message)}
const label=(status:string)=>({uploading:'上传中',paused:'已暂停',pending:'等待发布',accepted:'已进入文件池',rejected:'已取消',failed:'失败',cancelled:'已取消'} as Record<string,string>)[status]||status

async function json(url:string,options:RequestInit={}):Promise<any>{
 const response=await fetch(url,{credentials:'same-origin',...options,headers:{'X-ToolDock-Request':'1',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}})
 const value=await response.json()
 if(!response.ok)throw Error(value.error||'请求失败 '+response.status)
 return value
}
const post=(url:string,value:unknown)=>json(url,{method:'POST',body:JSON.stringify(value)})
const pools=initPools(json,post,err,{
 record:()=>recordNav(),
 back:()=>backNavigation(),
 backSteps:(steps:number)=>backNavigation(steps)
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
 if(matches.length===1&&matches[0].kind==='file')selectedLink.href='/api/files/'+encodeURIComponent(matches[0].id)
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
 window.location.assign(ticket.url)
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
  const link=document.createElement('a');link.className='download-button';link.href=file.kind==='directory'?'#':'/api/files/'+encodeURIComponent(file.id)
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
  else open.onclick=()=>{window.location.href='/api/files/'+encodeURIComponent(file.id)}
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
async function login(kind:'pin'|'token',value:string){
 await post('/api/auth',{kind,value})
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
  const el=jobs.get(u.id)?.row
  if(!el)continue
  const progress=el.querySelector('progress')
  if(progress){progress.max=u.size;progress.value=u.received}
  const status=el.querySelector<HTMLElement>('.meta')
  if(status){
   const suffix=label(u.status)
   status.textContent=human(u.received)+' / '+human(u.size)+' · '+suffix
  }
 }
}
function runQueue(){
 while(active<2&&queued.length){
  const job=queued.shift()!
  if(job.cancelled)continue
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
  const job:TransferJob={id:previous?.id||'',offset:0,file,relativeFolder,group:previous?.group||group,row,button:pause,paused:false,cancelled:false,running:false,finished:false}
  pause.onclick=()=>{if(job.finished||job.cancelled)return;job.paused=!job.paused;pause.textContent=job.paused?'继续':'暂停';if(!job.paused&&!job.running){queued.push(job);runQueue()}}
  cancel.onclick=()=>{job.cancelled=true;job.paused=true;row.remove();const data=cacheRead();delete data[signature(job.file)];cacheWrite(data);if(!job.running&&job.id)void json('/api/uploads/'+job.id,{method:'DELETE'}).catch(e=>err(String(e)))}
  queued.push(job);subtitle.textContent='已加入发送队列 · '+human(file.size)
 }
 runQueue()
}
async function upload(job:TransferJob){
 if(job.running||job.finished||job.cancelled)return
 job.running=true
 const {file,row,button:pause}=job
 const meta=row.querySelector<HTMLElement>('.meta')!
 const bar=row.querySelector('progress')!
 try{
  if(!job.id){
   const created=await post('/api/uploads',{name:file.name,size:file.size,relativeFolder:job.relativeFolder,group:job.group})
   job.id=created.id;jobs.set(job.id,job)
   const data=cacheRead();data[signature(file)]={id:job.id,group:job.group,relativeFolder:job.relativeFolder};cacheWrite(data)
   row.dataset.uploadId=job.id
  }else{
   try{const state=await json('/api/uploads/'+job.id);job.offset=state.offset;if(state.status==='accepted'){job.finished=true;return}}
   catch{const created=await post('/api/uploads',{name:file.name,size:file.size,relativeFolder:job.relativeFolder,group:job.group});job.id=created.id;job.offset=0;const data=cacheRead();data[signature(file)]={id:job.id,group:job.group,relativeFolder:job.relativeFolder};cacheWrite(data)}
   jobs.set(job.id,job)
  }
  while(job.offset<file.size&&!job.paused&&!job.cancelled){
   const bytes=new Uint8Array(await file.slice(job.offset,Math.min(job.offset+4*1024**2,file.size)).arrayBuffer())
   const digest=bytesToHex(sha256(bytes))
   const res=await fetch('/api/uploads/'+job.id+'?offset='+job.offset,{method:'PUT',headers:{'X-ToolDock-Request':'1','X-Chunk-SHA256':digest,'Content-Type':'application/octet-stream'},body:bytes as BodyInit})
   const result=await res.json()
   if(!res.ok){
    const actual=await json('/api/uploads/'+job.id)
    if(actual.offset!==undefined&&actual.offset!==job.offset){job.offset=actual.offset;continue}
    throw Error(result.error||'上传分片失败')
   }
   job.offset=result.offset;bar.value=job.offset
   meta.textContent=human(job.offset)+' / '+human(file.size)+' · 上传中'
  }
  if(job.offset===file.size&&!job.cancelled){
   await post('/api/uploads/'+job.id+'/complete',{})
   job.finished=true;meta.textContent='已进入共享文件池'
   pause.disabled=true;pause.textContent='已完成'
   const data=cacheRead();delete data[signature(file)];cacheWrite(data)
   pools.scheduleRefresh()
  }else if(!job.cancelled)meta.textContent=human(job.offset)+' / '+human(file.size)+' · 已暂停'
 }catch(e){
  if(!job.cancelled){job.paused=true;pause.textContent='继续';meta.textContent='发送中断，可点击继续';err('发送 '+file.name+' 失败：'+String(e))}
 }finally{
  job.running=false
  if(job.cancelled&&job.id)await json('/api/uploads/'+job.id,{method:'DELETE'}).catch(()=>{})
 }
}
$<HTMLAnchorElement>('download-selected').addEventListener('click',e=>{const selected=[...selectedDownload].map(id=>knownShares.get(id)).filter((x):x is Share=>Boolean(x));if(selected.length===1&&selected[0].kind==='file')return;e.preventDefault();if(selected.length)void downloadArchive(selected.map(x=>x.id)).catch(e=>err(String(e)))})
$('tab-download').addEventListener('click',()=>{currentPanel('download');anchorNav()})
$('tab-pool').addEventListener('click',()=>{currentPanel('pool');anchorNav()})
$('tab-messages').addEventListener('click',()=>{currentPanel('messages');anchorNav()})
$('pool-fab').addEventListener('click',()=>{if(!uploadEnabled)return;$('panel-upload').hidden=false;recordNav()})
$('upload-close').addEventListener('click',()=>backNavigation())
$('login-form').addEventListener('submit',e=>{e.preventDefault();void login('pin',($<HTMLInputElement>('pin')).value).catch(e=>err(String(e)))})
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
 live=new EventSource('/api/events')
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
const fragment=new URLSearchParams(location.hash.slice(1)).get('token')
if(fragment)void login('token',fragment).catch(e=>{err(String(e));history.replaceState(null,'',location.pathname)})
else void json('/api/status').then(()=>enterWorkspace()).catch(()=>{})
setInterval(()=>{if(!$('workspace').hidden){void syncUploads().catch(()=>{});if(!live)connectEvents()}},3000)
setInterval(()=>{if(!$('workspace').hidden)void refresh().catch(()=>{})},15000)
