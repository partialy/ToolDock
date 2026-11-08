type Json=(url:string,options?:RequestInit)=>Promise<any>
type PoolItem={id:string;name:string;kind:'file'|'directory';size:number;parentId:string|null;deviceName:string;createdAt:number}
type PoolPage={items:PoolItem[];nextCursor:string|null;total:number;usedBytes:number;itemCount:number}
type Message={id:string;deviceName:string;charCount:number;bytes:number;createdAt:number;kind:'text'|'file';preview:string;text?:string}
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const human=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':n+' B'
const element=(tag:string,className='',text='')=>{const e=document.createElement(tag);e.className=className;e.textContent=text;return e}
const button=(label:string,className='mini-button')=>{const b=element('button',className,label) as HTMLButtonElement;b.type='button';return b}
export function initPools(json:Json,post:(url:string,data:unknown)=>Promise<any>,onError:(message:string)=>void){
 const selected=new Set<string>(),trail:{id:string;name:string}[]=[]
 let page:PoolPage={items:[],nextCursor:null,total:0,usedBytes:0,itemCount:0}
 let messages:Message[]=[],messageTotal=0
 let pendingRefresh=0
 let currentText:string|null=null,viewerOffset=0,viewerNext=0,viewerDone=true
 let viewerStack:number[]=[]
 let busy=false
 const poolRoot=$('pool-files'),messageRoot=$('messages-list')
 const poolParent=()=>trail.at(-1)?.id||null
 const query=()=>new URLSearchParams({...(poolParent()?{parent:poolParent()!}:{}),q:$<HTMLInputElement>('pool-search').value,sort:$<HTMLSelectElement>('pool-sort').value})
 const updateProgress=()=>{
  $('pool-count').textContent=String(page.itemCount)
  $('pool-usage').textContent=human(page.usedBytes)+' / '+human(Number(($('pool-progress') as HTMLElement).dataset.limit||20*1024**3))
 }
 async function refreshPool(append=false){
  if(busy)return
  const p=query()
  if(append&&page.nextCursor)p.set('cursor',page.nextCursor)
  const result=await json('/api/pool?'+p) as PoolPage
  page=append?{...result,items:[...page.items,...result.items]}:result
  renderPool()
 }
 async function loadStatus(status:any){
  const stats=status.pool||{}
  ;($('pool-progress') as HTMLElement).dataset.limit=String(stats.limitBytes||20*1024**3)
  const pct=Math.max(0,Math.min(100,Math.round((stats.usedBytes||0)/(stats.limitBytes||20*1024**3)*100)))
  $('pool-progress').style.width=pct+'%'
  if(!status.poolDownloadAllowed) {
   poolRoot.replaceChildren(element('div','empty','主设备暂未开放文件池下载'))
  }else await refreshPool()
  $('connection-status').textContent='文件池 '+human(stats.usedBytes||0)+' / '+human(stats.limitBytes||20*1024**3)
  if(status.device?.name)$<HTMLInputElement>('device-name').value=status.device.name
 }
 const poolBreadcrumbs=()=>{
  const root=$('pool-breadcrumbs');root.replaceChildren()
  const all=[{id:'',name:'文件池'},...trail]
  all.forEach((item,index)=>{
   if(index)root.append(element('span','crumb-separator','›'))
   const b=button(item.name,'crumb'+(index===all.length-1?' current':''))
   b.onclick=()=>{trail.splice(index);selected.clear();void refreshPool().catch(e=>onError(String(e)))}
   root.append(b)
  })
 }
 const fileRow=(item:PoolItem)=>{
  const row=element('div','entry')
  const checkbox=button(selected.has(item.id)?'✓':'','checkmark'+(selected.has(item.id)?' selected':''))
  checkbox.setAttribute('aria-label','选择 '+item.name);checkbox.setAttribute('aria-pressed',String(selected.has(item.id)))
  checkbox.onclick=()=>{selected.has(item.id)?selected.delete(item.id):selected.add(item.id);renderPool()}
  const ico=element('div','file-icon',item.kind==='directory'?'DIR':(item.name.split('.').at(-1)||'FILE').slice(0,4).toUpperCase())
  const name=element('div','file-details')
  name.append(element('div','name',item.name),element('div','meta',(item.kind==='directory'?'文件夹':human(item.size))+' · '+item.deviceName+' · '+new Date(item.createdAt).toLocaleString()))
  const open=button('','file-browse')
  open.append(ico,name)
  if(item.kind==='directory')open.onclick=()=>{trail.push({id:item.id,name:item.name});selected.clear();void refreshPool().catch(e=>onError(String(e)))}
  else open.onclick=()=>{
   const ext=item.name.slice(item.name.lastIndexOf('.')).toLowerCase()
   const previewable=['.png','.jpg','.jpeg','.gif','.webp','.txt','.md','.json','.jsonl','.log','.csv','.xml','.yaml','.yml','.ini','.conf','.srt','.vtt','.lrc'].includes(ext)&&item.size<=8*1024**2
   if(previewable)window.open('/api/pool/preview/'+item.id,'_blank','noopener,noreferrer')
   else window.location.assign('/api/pool/files/'+item.id)
  }
  const down=button('↓','download-button')
  down.setAttribute('aria-label','下载 '+item.name)
  down.onclick=()=>{if(item.kind==='directory')void downloadArchive([item.id]);else window.location.assign('/api/pool/files/'+item.id)}
  row.append(checkbox,open,down)
  return row
 }
 function renderPool(){
  poolBreadcrumbs();poolRoot.replaceChildren()
  $('pool-count').textContent=String(page.itemCount)
  const limit=Number(($('pool-progress') as HTMLElement).dataset.limit||20*1024**3)
  $('pool-usage').textContent=human(page.usedBytes)+' / '+human(limit)
  $('pool-progress').style.width=Math.min(100,Math.round(page.usedBytes/limit*100))+'%'
  $('pool-selected-count').textContent=selected.size?'已选择 '+selected.size+' 项':'尚未选择'
  $('pool-select-all').textContent=page.items.length&&page.items.every(x=>selected.has(x.id))?'取消全选':'全选当前页'
  $<HTMLButtonElement>('pool-download-selected').disabled=!selected.size
  $<HTMLButtonElement>('pool-more').hidden=!page.nextCursor
  if(!page.items.length)poolRoot.append(element('div','empty',$<HTMLInputElement>('pool-search').value?'没有匹配的文件':'文件池还是空的，点击右下角按钮上传文件'))
  else page.items.forEach(item=>poolRoot.append(fileRow(item)))
 }
 async function downloadArchive(ids:string[]){
  try{const result=await post('/api/pool/archive',{ids});location.assign(result.url)}
  catch(e){onError(String(e))}
 }
 async function refreshMessages(){
  const response=await json('/api/messages') as {items:Message[];total:number}
  messages=response.items;messageTotal=response.total
  renderMessages()
 }
 async function copyText(id:string){
  try{
   const response=await fetch('/api/messages/'+id+'/text',{credentials:'same-origin'})
   if(!response.ok)throw Error('获取消息全文失败')
   const full=await response.text()
   if(navigator.clipboard?.writeText&&window.isSecureContext)await navigator.clipboard.writeText(full)
   else{
    const area=document.createElement('textarea')
    area.value=full;area.style.position='fixed';area.style.left='-10000px'
    document.body.append(area);area.focus();area.select()
    const copied=document.execCommand('copy');area.remove()
    if(!copied)throw Error('浏览器未授权复制')
   }
   onError('');return true
  }catch(e){onError('复制失败，可通过下载 TXT 保存全文：'+String(e));return false}
 }
 const linkify=(container:HTMLElement,value:string)=>{const pattern=/(https?:\/\/[^\s<>\"'，。；（）]+)/g;for(const part of value.split(pattern)){if(!/^https?:\/\//.test(part)){container.append(document.createTextNode(part));continue}try{const url=new URL(part);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=part;container.append(a)}catch{container.append(document.createTextNode(part))}}}
 const messageRow=(item:Message)=>{
  const card=element('article','message-item')
  const info=element('div','message-item-head')
  info.append(element('strong','',item.deviceName),element('span','',new Date(item.createdAt).toLocaleString()))
  const copy=button('复制全文');copy.onclick=()=>void copyText(item.id)
  info.append(copy);card.append(info)
  if(item.kind==='file'){
   card.append(element('p','message-text',item.preview+'…'))
   card.append(element('p','meta',item.charCount.toLocaleString()+' 字符 · '+human(item.bytes)+' · 临时 TXT'))
   const tools=element('div','message-tools')
   const view=button('打开查看');view.onclick=()=>void openViewer(item)
   const download=element('a','mini-button','下载 TXT') as HTMLAnchorElement
   download.href='/api/messages/'+item.id+'/download';download.download='message.txt'
   tools.append(view,download);card.append(tools)
  }else{const body=element('p','message-text');linkify(body,item.text||'');card.append(body)}
  return card
 }
 function renderMessages(){
  $('messages-count').textContent=String(messageTotal)
  messageRoot.replaceChildren()
  if(!messages.length){messageRoot.append(element('div','empty','暂时没有消息，输入文字即可分享给所有设备'));return}
  messages.forEach(item=>messageRoot.append(messageRow(item)))
 }
 async function sendMessage(){
  const input=$<HTMLTextAreaElement>('message-input'),value=input.value
  if(!value.trim())return
  const send=$<HTMLButtonElement>('message-send');send.disabled=true
  try{
   const res=await fetch('/api/messages',{method:'POST',credentials:'same-origin',headers:{'X-ToolDock-Request':'1','Content-Type':'text/plain; charset=utf-8'},body:value})
   const data=await res.json()
   if(!res.ok)throw Error(data.error||'消息发送失败')
   input.value='';await refreshMessages();messageRoot.scrollTop=messageRoot.scrollHeight;onError('')
  }catch(e){onError('消息发送失败：'+String(e))}
  finally{send.disabled=false}
 }
 const showViewer=(open:boolean)=>{const panel=$('text-viewer');panel.hidden=!open;document.body.classList.toggle('viewer-active',open)}
 async function loadViewer(offset:number){
  if(!currentText)return
  const part=await json('/api/messages/'+currentText+'/chunk?offset='+offset) as {text:string;nextOffset:number;done:boolean}
  viewerOffset=offset;viewerNext=part.nextOffset;viewerDone=part.done
  $('viewer-content').textContent=part.text
  $<HTMLButtonElement>('viewer-prev').disabled=!viewerStack.length
  $<HTMLButtonElement>('viewer-next').disabled=viewerDone
 }
 async function openViewer(item:Message){
  currentText=item.id;viewerStack=[];showViewer(true)
  $('viewer-info').textContent=item.charCount.toLocaleString()+' 字符 · '+human(item.bytes)
  $<HTMLAnchorElement>('viewer-download').href='/api/messages/'+item.id+'/download'
  $('viewer-hits').replaceChildren();$<HTMLInputElement>('viewer-search').value=''
  try{await loadViewer(0)}catch(e){onError(String(e))}
 }
 async function searchViewer(){
  if(!currentText)return
  const q=$<HTMLInputElement>('viewer-search').value.trim()
  if(!q)return
  try{
   const data=await json('/api/messages/'+currentText+'/search?q='+encodeURIComponent(q)) as {hits:{offset:number;snippet:string}[]}
   const root=$('viewer-hits');root.replaceChildren()
   data.hits.forEach(hit=>root.append(element('p','',hit.offset+': '+hit.snippet)))
   if(!data.hits.length)root.append(element('p','', '没有找到匹配内容'))
  }catch(e){onError(String(e))}
 }
 let timer:ReturnType<typeof setTimeout>|null=null
 function scheduleRefresh(){
  if(timer)clearTimeout(timer)
  timer=setTimeout(()=>{void Promise.allSettled([refreshPool(),refreshMessages()])},220)
 }
 $('pool-refresh').onclick=()=>void refreshPool().catch(e=>onError(String(e)))
 $('pool-search').addEventListener('input',()=>scheduleRefresh())
 $('pool-sort').addEventListener('change',()=>void refreshPool().catch(e=>onError(String(e))))
 $('pool-select-all').onclick=()=>{const all=page.items.every(x=>selected.has(x.id));page.items.forEach(item=>all?selected.delete(item.id):selected.add(item.id));renderPool()}
 $('pool-more').onclick=()=>void refreshPool(true).catch(e=>onError(String(e)))
 $('pool-download-selected').onclick=()=>{const ids=[...selected];if(ids.length===1){const item=page.items.find(x=>x.id===ids[0]);if(item?.kind==='file'){location.assign('/api/pool/files/'+item.id);return}}void downloadArchive(ids)}
 $('pool-download-all').onclick=()=>void downloadArchive([])
 $('messages-refresh').onclick=()=>void refreshMessages().catch(e=>onError(String(e)))
 $('message-send').onclick=()=>void sendMessage()
 $('message-input').addEventListener('keydown',e=>{const key=e as KeyboardEvent;if(key.key==='Enter'&&(key.ctrlKey||key.metaKey)){e.preventDefault();void sendMessage()}})
 $('viewer-close').onclick=()=>{currentText=null;showViewer(false)}
 $('viewer-next').onclick=()=>{if(currentText&&!viewerDone){viewerStack.push(viewerOffset);void loadViewer(viewerNext)}}
 $('viewer-prev').onclick=()=>{if(currentText&&viewerStack.length){const previous=viewerStack.pop()!;void loadViewer(previous)}}
 $('viewer-find').onclick=()=>void searchViewer()
 $('viewer-copy').onclick=()=>{if(currentText)void copyText(currentText)}
 $('edit-device').onclick=()=>{$('device-editor').hidden=!$('device-editor').hidden}
 $('save-device').onclick=()=>{const name=$<HTMLInputElement>('device-name').value.trim();if(!name)return;void post('/api/device/name',{name}).then(()=>{$('device-editor').hidden=true}).catch(e=>onError(String(e)))}
 return {refreshPool,refreshMessages,scheduleRefresh,loadStatus}
}
