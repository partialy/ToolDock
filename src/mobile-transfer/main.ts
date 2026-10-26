import './style.css'
import {sha256} from '@noble/hashes/sha2.js'
import {bytesToHex} from '@noble/hashes/utils.js'
type Share={id:string;name:string;size:number;status:string}
type Up={id:string;name:string;size:number;received:number;status:string}
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const human=(n:number)=>n>1024**3?(n/1024**3).toFixed(2)+' GiB':n>1024**2?(n/1024**2).toFixed(1)+' MiB':(n/1024).toFixed(1)+' KiB'
const pending=new Map<string,File>()
const err=(s:string)=>{$('error').textContent=s}
async function json(url:string,options:RequestInit={}):Promise<any>{
 const response=await fetch(url,{credentials:'same-origin',...options,headers:{'X-ToolDock-Request':'1',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}})
 const value=await response.json()
 if(!response.ok)throw Error(value.error||'请求失败 '+response.status)
 return value
}
const post=(url:string,value:unknown)=>json(url,{method:'POST',body:JSON.stringify(value)})
async function login(kind:'pin'|'token',value:string){
 await post('/api/auth',{kind,value})
 history.replaceState(null,'',location.pathname)
 $('login').hidden=true;$('workspace').hidden=false;err('')
 await refresh()
}
async function refresh(){
 const status=await json('/api/status')
 const shares=$('shares');shares.replaceChildren()
 const list=status.shares as Share[]
 $('download-all').hidden=!status.downloadAllowed||!list.length
 if(!list.length)shares.textContent='电脑暂未分享文件'
 for(const s of list){
  const row=document.createElement('div');row.className='entry'
  const meta=document.createElement('div'),title=document.createElement('div'),size=document.createElement('div')
  title.className='name';title.textContent=s.name
  size.className='meta';size.textContent=human(s.size)+(s.status!=='ready'?' · 文件已变化':'')
  meta.append(title,size)
  const a=document.createElement('a');a.href='/api/files/'+encodeURIComponent(s.id);a.textContent='下载';a.download=s.name
  row.append(meta,a);shares.append(row)
 }
 const permitted=Boolean(status.uploadAllowed)
 $('choose').toggleAttribute('disabled',!permitted)
 $('upload').toggleAttribute('disabled',!permitted)
 if(!permitted)$('uploads').textContent='电脑暂未开放上传权限'
 await syncUploads()
}
async function syncUploads(){
 const body=await json('/api/uploads')
 for(const u of body.uploads as Up[]){
  const el=document.querySelector<HTMLElement>('[data-upload-id="'+u.id+'"]')
  if(el){
   const progress=el.querySelector('progress')
   if(progress){progress.max=u.size;progress.value=u.received}
   const status=el.querySelector<HTMLElement>('.meta')
   if(status)status.textContent=human(u.received)+' / '+human(u.size)+' · '+label(u.status)
  }
 }
}
const label=(status:string)=>({uploading:'上传中',paused:'已暂停',pending:'等待电脑确认',accepted:'电脑已接收',rejected:'电脑已拒绝',failed:'失败'} as Record<string,string>)[status]||status
async function upload(file:File){
 let id='',offset=0
 const row=document.createElement('div');row.className='entry'
 const info=document.createElement('div'),title=document.createElement('div'),meta=document.createElement('div'),bar=document.createElement('progress')
 info.append(title,meta,bar);title.textContent=file.name;title.className='name';meta.className='meta'
 bar.max=file.size;bar.value=0
 const button=document.createElement('button');button.className='secondary';button.textContent='暂停'
 const cancel=document.createElement('button');cancel.className='secondary';cancel.textContent='取消'
 const actions=document.createElement('div');actions.append(button,cancel)
 row.append(info,actions);$('uploads').prepend(row)
 let paused=false,cancelled=false
 button.onclick=()=>{paused=!paused;button.textContent=paused?'继续':'暂停';if(!paused)void process()}
 const process=async()=>{
  if(!id){const created=await post('/api/uploads',{name:file.name,size:file.size});id=created.id;row.dataset.uploadId=id;pending.set(id,file)}
  try{
   while(offset<file.size&&!paused&&!cancelled){
    const bytes=new Uint8Array(await file.slice(offset,Math.min(offset+4*1024**2,file.size)).arrayBuffer())
    const digest=bytesToHex(sha256(bytes))
    const res=await fetch('/api/uploads/'+id+'?offset='+offset,{method:'PUT',headers:{'X-ToolDock-Request':'1','X-Chunk-SHA256':digest,'Content-Type':'application/octet-stream'},body:bytes as BodyInit})
    const body=await res.json()
    if(!res.ok){
     const actual=await json('/api/uploads/'+id)
     if(actual.offset!==undefined&&actual.offset!==offset){offset=actual.offset;continue}
     throw Error(body.error||'上传分片失败')
    }
    offset=body.offset;bar.value=offset;meta.textContent=human(offset)+' / '+human(file.size)+' · 上传中'
   }
   if(offset===file.size&&!cancelled){
    await post('/api/uploads/'+id+'/complete',{})
    meta.textContent='文件上传完成，等待电脑点击确认接收';button.textContent='完成';button.disabled=true;pending.delete(id)
   }
  }catch(e){err('上传 '+file.name+' 失败：'+String(e));meta.textContent='发送暂停，可稍后继续';paused=true;button.textContent='继续'}
 }
 cancel.onclick=()=>{cancelled=true;paused=true;if(id)void json('/api/uploads/'+id,{method:'DELETE'}).catch(e=>err(String(e)));pending.delete(id);row.remove()}
 await process()
}
$('login-form').addEventListener('submit',e=>{e.preventDefault();void login('pin',($<HTMLInputElement>('pin')).value).catch(e=>err(String(e)))})
$('refresh').addEventListener('click',()=>void refresh().catch(e=>err(String(e))))
$('upload').addEventListener('click',()=>{
 const input=$<HTMLInputElement>('choose')
 for(const file of [...(input.files||[])])void upload(file)
 input.value=''
})
const fragment=new URLSearchParams(location.hash.slice(1)).get('token')
if(fragment)void login('token',fragment).catch(e=>{err(String(e));history.replaceState(null,'',location.pathname)})
else void json('/api/status').then(()=>{$('login').hidden=true;$('workspace').hidden=false;return refresh()}).catch(()=>{})
setInterval(()=>{if(!$('workspace').hidden)void syncUploads().catch(()=>{})},3000)
