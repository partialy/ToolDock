import {msg} from '@/components/ui/message'
import {useEffect,useRef,useState} from 'react'
import {FileImage,Package,Plus,Scissors,Trash2,Download,Eye,X,AlertTriangle} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {ImageCropDialog} from './ImageCropDialog'
import {LogoOptionsPanel} from './LogoOptionsPanel'
import {decode,renderImage,type ImageFormat} from '@/lib/image/export'
import {outputDimensions,type FitMode,type CropRect} from '@/lib/image/geometry'
import {generateLogoOutputs} from '@/lib/image/logo-render'
import {safeStem,validateImageFile,verifyMagic,BATCH_MAX_COUNT,BATCH_MAX_BYTES} from '@/lib/image/file-validation'
import {sanitizeSvg} from '@/lib/image/svg-safety'
import {zipToSink} from '@/lib/export/zip-stream'
import {runImageWorker} from '@/lib/image/worker-client'
import {rasterizeSafeSvg} from '@/lib/image/svg-rasterize'
import {DialogShell} from '@/components/ui/dialog-shell'
import {useWindowFileDrop,DropOverlay} from '@/hooks/useWindowFileDrop'

type Item={id:string;file:File;preview:string;stem:string;crop?:CropRect}
type Result={id:string;sourceId:string;name:string;blob:Blob;format:'png'|'jpg'|'webp'|'ico';width:number;height:number;variant?:'default'|'round';radiusPercent?:number}
const CARD='rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4'
const MB=1024*1024
const formatFile=(n:number)=>n>=MB?(n/MB).toFixed(2)+' MiB':(n/1024).toFixed(1)+' KiB'
const unique=(names:string[],next:string)=>{let name=next,index=2;while(names.includes(name)){const dot=next.lastIndexOf('.');name=next.slice(0,dot)+'_'+index+++next.slice(dot)}return name}
async function blobToFileSink(blob:Blob,id:string){
 for(let pos=0;pos<blob.size;pos+=524288)await window.toolDock.export.chunk(id,new Uint8Array(await blob.slice(pos,pos+524288).arrayBuffer()))
}
async function saveBlob(blob:Blob,name:string,format:'png'|'jpg'|'webp'|'ico'){
 const id=await window.toolDock.export.start(name,format);if(!id)return false
 try{await blobToFileSink(blob,id);await window.toolDock.export.finish(id);return true}
 catch(e){await window.toolDock.export.cancel(id);throw e}
}
function ImageCompareDialog({item,results,onClose}:{item:Item;results:Result[];onClose:()=>void}){
 const [selectedId,setSelectedId]=useState<string>('')
 const [url,setUrl]=useState('')
 const sorted=[...results].sort((a,b)=>(b.variant==='round'?1:0)-(a.variant==='round'?1:0)||b.width-a.width)
 const active=sorted.find(r=>r.id===selectedId)||sorted[0]||null
 useEffect(()=>{if(!active){setUrl('');return}const u=URL.createObjectURL(active.blob);setUrl(u);return()=>URL.revokeObjectURL(u)},[active])
 return <DialogShell open onOpenChange={v=>{if(!v)onClose()}} title={'图片预览对比 · '+item.file.name} width="workspace">
  <div className="grid min-h-0 gap-4 md:grid-cols-2">
   <div className="min-h-[220px] space-y-2"><div className="text-xs muted">原图 · {formatFile(item.file.size)}</div><img src={item.preview} alt="原图" className="h-[min(65vh,600px)] w-full rounded-xl bg-[var(--panel-alt)] object-contain"/></div>
   <div className="min-h-[220px] space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <div className="text-xs muted">{active?'处理结果 · '+active.width+'×'+active.height+' · '+formatFile(active.blob.size):'尚无处理结果'}</div>
     {sorted.length>1&&(
      <SelectField
       ariaLabel="选择对比结果"
       value={active?.id||''}
       onValueChange={setSelectedId}
       options={sorted.map(r=>({value:r.id,label:r.name+(r.variant==='round'?'（圆角）':'')}))}
       className="h-8 min-w-[180px]"
      />
     )}
    </div>
    {active&&url&&<img src={url} alt="处理后的图片" className="h-[min(65vh,600px)] w-full rounded-xl bg-[var(--panel-alt)] object-contain"/>}
   </div>
  </div>
 </DialogShell>
}
export function ImageWorkspace({kind}:{kind:'image'|'logo'}){
 const logo=kind==='logo'
 const input=useRef<HTMLInputElement>(null),runId=useRef(0),itemsRef=useRef<Item[]>([]),activeAbort=useRef<(()=>void)|null>(null)
 const [items,setItems]=useState<Item[]>([]),[outputs,setOutputs]=useState<Result[]>([])
 const [mode,setMode]=useState<'width'|'percent'|'fixed'>('width'),[sizeValue,setSizeValue]=useState(1200),[targetHeight,setTargetHeight]=useState(800)
 const [fit,setFit]=useState<FitMode>('contain'),[quality,setQuality]=useState(90),[format,setFormat]=useState<ImageFormat>('webp')
 const [logoFit,setLogoFit]=useState<FitMode>('cover'),[cornerRadiusPercent,setCornerRadiusPercent]=useState(0),[dualRoundOutput,setDualRoundOutput]=useState(false)
 const [selectedSizes,setSelectedSizes]=useState<number[]>([16,32,48,128,256])
 const [selectedFormats,setSelectedFormats]=useState<string[]>(['png','ico'])
 const [error,setError]=useState(''),[status,setStatus]=useState('idle'),[progress,setProgress]=useState(0),[taskTotal,setTaskTotal]=useState(0),[taskName,setTaskName]=useState('')
 const [failures,setFailures]=useState<Record<string,string>>({}),[cropId,setCropId]=useState<string|null>(null),[previewId,setPreviewId]=useState<string|null>(null),[livePreviewId,setLivePreviewId]=useState<string|null>(null)
 const [version,setVersion]=useState(0),[processedVersion,setProcessedVersion]=useState(-1),[exported,setExported]=useState(false)
 const dirty=items.length>0&&!exported
 useEffect(()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:dirty}));return()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:false}))}},[dirty])
 useEffect(()=>{itemsRef.current=items},[items])
 useEffect(()=>()=>{runId.current++;activeAbort.current?.();itemsRef.current.forEach(x=>URL.revokeObjectURL(x.preview))},[])
 const change=()=>{setVersion(v=>v+1);setExported(false)}
 const cancel=()=>{runId.current++;activeAbort.current?.();activeAbort.current=null;setStatus('cancelled')}
 const clean=()=>{cancel();items.forEach(x=>URL.revokeObjectURL(x.preview));setItems([]);setOutputs([]);setFailures({});setLivePreviewId(null);setProcessedVersion(-1);setExported(true);setError('')}
 const add=async(files:FileList|File[])=>{
  const list=Array.from(files)
  if(items.length+list.length>BATCH_MAX_COUNT||items.reduce((n,f)=>n+f.file.size,0)+list.reduce((n,f)=>n+f.size,0)>BATCH_MAX_BYTES){setError('每批最多 100 张图片、合计不超过 300 MiB');return}
  const loaded:Item[]=[],issues:string[]=[]
  for(const file of list){
   try{
    validateImageFile(file,logo)
    if(file.type==='image/svg+xml'){
     const safe=sanitizeSvg(await file.text())
     const safeBlob=new Blob([safe],{type:'image/svg+xml'})
     loaded.push({id:crypto.randomUUID(),file,preview:URL.createObjectURL(safeBlob),stem:safeStem(file.name)})
    }else{
     if(!verifyMagic(new Uint8Array(await file.slice(0,16).arrayBuffer()),file.type))throw Error('图片文件头无效')
     loaded.push({id:crypto.randomUUID(),file,preview:URL.createObjectURL(file),stem:safeStem(file.name)})
    }
   }catch(e){issues.push(file.name+': '+String(e))}
  }
  if(loaded.length){setItems(v=>[...v,...loaded]);change()}
  setError(issues.join('\n'))
 }
 const remove=(id:string)=>{const item=items.find(x=>x.id===id);if(item)URL.revokeObjectURL(item.preview);setItems(v=>v.filter(x=>x.id!==id));setOutputs(v=>v.filter(x=>x.sourceId!==id));if(livePreviewId===id)setLivePreviewId(null);change()}
 const process=async(targetId?:string)=>{
  if(!items.length)return
  const retry=targetId&&processedVersion===version
  const todo=retry?items.filter(x=>x.id===targetId):items
  if(!todo.length)return
  if(logo&&(!selectedSizes.length||!selectedFormats.length)){setError('请至少选择一种尺寸和格式');return}
  const id=++runId.current,currentVersion=version
  setStatus('running');setError('');setProgress(0);setTaskTotal(todo.length);setTaskName('');setProcessedVersion(-1);setExported(false)
  const created:Result[]=retry?outputs.filter(x=>x.sourceId!==targetId):[]
  const errors:Record<string,string>=retry?{...failures}:{}
  if(targetId)delete errors[targetId]
  setFailures({...errors})
  let bytes=created.reduce((n,r)=>n+r.blob.size,0)
  for(let i=0;i<todo.length;i++){
   if(id!==runId.current)return
   const it=todo[i];setTaskName(it.file.name);let bitmap:ImageBitmap|null=null
   const rollbackIndex=created.length,rollbackBytes=bytes
   try{
    if(typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'){
     const source=it.file.type==='image/svg+xml'?await rasterizeSafeSvg(it.file):it.file
     const job=runImageWorker({
      file:source,kind,mode,sizeValue,targetHeight,fit,logoFit,
      cornerRadiusPercent,dualRoundOutput,quality,format,crop:it.crop,
      sizes:selectedSizes,formats:selectedFormats,stem:safeStem(it.stem)
     })
     activeAbort.current=job.abort
     const done=await job.promise
     activeAbort.current=null
     for(const r of done){bytes+=r.blob.size;if(bytes>300*MB)throw Error('本批输出超过 300 MiB');created.push({...r,id:crypto.randomUUID(),sourceId:it.id})}
    }else{
    bitmap=await decode(it.file,logo)
    const region=it.crop||{x:0,y:0,width:bitmap.width,height:bitmap.height}
    if(region.x<0||region.y<0||region.x+region.width>bitmap.width+1||region.y+region.height>bitmap.height+1)throw Error('裁剪范围超出图片')
    if(logo){
     const generated=await generateLogoOutputs({
      stem:safeStem(it.stem),
      sizes:selectedSizes,
      formats:selectedFormats,
      cornerRadiusPercent,
      dualRoundOutput,
      renderBlob:(size,imgFmt,radius)=>renderImage(bitmap!,size,size,imgFmt,quality,logoFit,region,radius),
      onOutput:r=>{bytes+=r.blob.size;if(bytes>300*MB)throw Error('本批输出超过 300 MiB，已停止缓存')}
     })
     for(const r of generated)created.push({...r,id:crypto.randomUUID(),sourceId:it.id})
    }else{
     const dims=outputDimensions(region.width,region.height,mode,sizeValue,targetHeight)
     const blob=await renderImage(bitmap,dims.width,dims.height,format,quality,fit,region)
     bytes+=blob.size;if(bytes>300*MB)throw Error('本批输出超过 300 MiB')
     const ext=format==='jpeg'?'jpg':format
     created.push({id:crypto.randomUUID(),sourceId:it.id,name:safeStem(it.stem)+'_'+dims.width+'x'+dims.height+'.'+ext,blob,format:ext,width:dims.width,height:dims.height})
    }
    }
   }catch(e){created.splice(rollbackIndex);bytes=rollbackBytes;errors[it.id]=e instanceof Error?e.message:String(e)}
   finally{bitmap?.close()}
   if(id!==runId.current)return
   setProgress(i+1);setOutputs([...created]);setFailures({...errors})
   await new Promise(resolve=>setTimeout(resolve,0))
  }
  if(id!==runId.current)return
  setProcessedVersion(currentVersion)
  setStatus(Object.keys(errors).length?'partial':'complete')
 }
 const saveOne=async(r:Result)=>{try{const ok=await saveBlob(r.blob,r.name,r.format);if(ok){if(outputs.length===1)setExported(true);msg.success('图片已导出')}}catch(e){msg.error(e)}}
 const saveAll=async()=>{
  if(!outputs.length||processedVersion!==version){setError('请使用当前配置重新生成');return}
  const token=await window.toolDock.export.start(logo?'icons.zip':'processed-images.zip','zip')
  if(!token)return
  try{
   const names:string[]=[],usedFolders:string[]=[],folders=new Map<string,string>()
   for(const item of items){const stem=safeStem(item.stem);let folder=stem,index=2;while(usedFolders.includes(folder))folder=stem+'_'+index++;usedFolders.push(folder);folders.set(item.id,folder)}
   const entries=outputs.map(r=>{const folder=folders.get(r.sourceId)||'image';const proposed=(logo?folder+'/':'')+r.name;const name=unique(names,proposed);names.push(name);return {name,blob:r.blob}})
   await zipToSink(entries,async chunk=>{for(let p=0;p<chunk.length;p+=524288)await window.toolDock.export.chunk(token,chunk.slice(p,p+524288))})
   await window.toolDock.export.finish(token);setExported(true);msg.success('图片已打包导出')
  }catch(e){await window.toolDock.export.cancel(token);msg.error(e)}
 }
 const toggleFormat=(f:string)=>{setSelectedFormats(list=>list.includes(f)?list.filter(x=>x!==f):[...list,f]);change()}
 const toggleSize=(n:number)=>{setSelectedSizes(list=>list.includes(n)?list.filter(x=>x!==n):[...list,n].sort((a,b)=>a-b));change()}
 const cropItem=items.find(i=>i.id===cropId)
 const previewItem=items.find(i=>i.id===previewId)
 const previewResults=outputs.filter(o=>o.sourceId===previewId&&o.format!=='ico')
 const activeLiveItem=items.find(i=>i.id===livePreviewId)||items[0]
 const ready=processedVersion===version&&!!outputs.length
 const dropOver=useWindowFileDrop(files=>{if(status==='running'){setError('正在处理图片，暂不允许添加');return}const actual=files.filter(f=>f.size>0||f.type!=='');if(!actual.length){setError('不支持拖入文件夹，请直接拖入图片文件');return}void add(actual)},true)
 return <div className="relative @container mx-auto max-w-[1500px] space-y-4 p-5">
  <header className="flex flex-wrap items-center gap-3"><div className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={22}/></div><div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">{logo?'Logo / ICO 生成器':'图片处理'}</h1><p className="mt-1 text-xs muted">{logo?'批量生成标准尺寸 PNG、WebP、JPEG 与多帧 ICO':'图片批量缩放、压缩、格式转换与非破坏式裁剪'} · 完全本地</p></div><Button variant="ghost" disabled={!items.length} onClick={clean}><Trash2 size={14}/> 清空队列</Button></header>
  <input ref={input} multiple className="hidden" type="file" accept={logo?'.png,.jpg,.jpeg,.webp,.svg':'image/png,image/jpeg,image/webp'} onChange={e=>{if(e.target.files)void add(e.target.files);e.target.value=''}}/>
  <div className="grid gap-4 @min-[900px]:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
   <section className={CARD+' min-w-0 space-y-3'}><div className="flex items-center justify-between"><h2 className="font-semibold">文件队列 <span className="text-xs muted">{items.length} 张</span></h2><Button size="sm" onClick={()=>input.current?.click()}><Plus size={15}/> 添加图片</Button></div>
    <div className="max-h-[490px] space-y-2 overflow-y-auto">{items.length?items.map(it=>{
     const isLive=logo&&activeLiveItem?.id===it.id
     return <div key={it.id} className={'flex items-center gap-3 rounded-xl border bg-[var(--panel-alt)] p-2 '+(isLive?'border-[var(--primary)]/60':'border-[var(--border)]')}>
      <button type="button" onClick={()=>logo&&setLivePreviewId(it.id)} title={logo?'点击切换实时预览图':undefined} className="shrink-0 rounded-lg focus-visible:outline-none">
       <img src={it.preview} className="h-14 w-14 rounded-lg object-contain" alt="源文件预览"/>
      </button>
      <div className="min-w-0 flex-1"><div className="truncate text-xs" title={it.file.name}>{it.file.name}</div><div className="mt-1 text-[11px] muted">{formatFile(it.file.size)} {it.crop?'· 已裁剪':''} {isLive&&items.length>1?'· 预览中':''}</div>
       {logo&&<Input aria-label={'导出名称 '+it.file.name} value={it.stem} onChange={e=>{setItems(v=>v.map(x=>x.id===it.id?{...x,stem:e.target.value}:x));change()}} className="mt-1 h-8 text-xs"/>}
       {failures[it.id]&&<div className="flex flex-wrap items-center gap-2"><p className="text-[11px] text-red-400">{failures[it.id]}</p><Button size="sm" variant="ghost" disabled={status==='running'} onClick={()=>void process(it.id)}>重试此文件</Button></div>}
      </div>
      <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" title="预览" onClick={()=>{if(logo)setLivePreviewId(it.id);setPreviewId(it.id)}}><Eye size={15}/></Button><Button variant="ghost" size="icon" title="裁剪" onClick={()=>setCropId(it.id)}><Scissors size={15}/></Button><Button variant="ghost" size="icon" title="移除" onClick={()=>remove(it.id)}><Trash2 size={15}/></Button></div>
     </div>
    }):<p className="py-10 text-center text-xs muted">还未选择图片，拖动文件到窗口开始使用</p>}</div>
   </section>
   <section className={CARD+' min-w-0 space-y-4'}><h2 className="font-semibold">{logo?'尺寸与输出格式':'处理参数'}</h2>
    {logo?<LogoOptionsPanel
     previewItem={activeLiveItem?{preview:activeLiveItem.preview,fileName:activeLiveItem.file.name,stem:safeStem(activeLiveItem.stem),crop:activeLiveItem.crop}:undefined}
     logoFit={logoFit}
     onLogoFitChange={next=>{setLogoFit(next);change()}}
     cornerRadiusPercent={cornerRadiusPercent}
     onCornerRadiusChange={next=>{setCornerRadiusPercent(next);change()}}
     dualRoundOutput={dualRoundOutput}
     onDualRoundOutputChange={next=>{setDualRoundOutput(next);change()}}
     selectedSizes={selectedSizes}
     onToggleSize={toggleSize}
     selectedFormats={selectedFormats}
     onToggleFormat={toggleFormat}
     disabled={status==='running'}
    />:
      <><SelectField ariaLabel="缩放方式" value={mode} onValueChange={v=>{setMode(v as typeof mode);change()}} options={[{value:'width',label:'最大宽度（不放大小图）'},{value:'percent',label:'百分比缩放'},{value:'fixed',label:'指定宽高'}]}/>
       <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs muted">{mode==='width'?'最大宽度':mode==='percent'?'缩放百分比':'目标宽度'}<Input type="number" min={1} value={sizeValue} onChange={e=>{setSizeValue(Number(e.target.value));change()}}/></label>{mode==='fixed'&&<label className="space-y-1 text-xs muted">目标高度<Input type="number" min={1} value={targetHeight} onChange={e=>{setTargetHeight(Number(e.target.value));change()}}/></label>}</div>
       {mode==='fixed'&&<SelectField ariaLabel="尺寸适配" value={fit} onValueChange={v=>{setFit(v as FitMode);change()}} options={[{value:'contain',label:'等比留白'},{value:'cover',label:'居中裁剪'},{value:'stretch',label:'强制拉伸'}]}/>}
       <SelectField ariaLabel="输出格式" value={format} onValueChange={v=>{setFormat(v as ImageFormat);change()}} options={[{value:'png',label:'PNG（无损）'},{value:'jpeg',label:'JPEG'},{value:'webp',label:'WebP'}]}/></>}
    <label className="block space-y-2 text-xs muted">输出质量 {quality}% {(!logo&&format==='png')?'（PNG 无损，质量滑块无效）':''}<input disabled={!logo&&format==='png'} type="range" min={1} max={100} value={quality} onChange={e=>{setQuality(Number(e.target.value));change()}} className="w-full"/></label>
    <div className="space-y-2 border-t border-[var(--border)] pt-3">
     {status==='running'&&<p className="text-xs muted">处理中：{progress}/{taskTotal} · {taskName}</p>}
     {status==='partial'&&<p className="text-xs text-amber-400">部分文件处理失败，可调整后重新处理</p>}
     {status==='cancelled'&&<p className="text-xs muted">任务已取消</p>}
     {outputs.length>0&&processedVersion!==version&&<p className="text-xs text-amber-400">配置已改变，旧结果已过期，请重新处理</p>}
     <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={!items.length||status==='running'} onClick={()=>void process()}><FileImage size={15}/> {logo?'生成图标':'批量处理'}</Button>{status==='running'&&<Button onClick={cancel}><X size={15}/> 取消</Button>}
      <Button disabled={!ready} onClick={()=>void saveAll()}><Package size={15}/> 下载全部 ZIP</Button></div>
     {status==='running'&&<div className="h-2 overflow-hidden rounded-full bg-[var(--panel-alt)]"><div style={{width:taskTotal?progress/taskTotal*100+'%':'0%'}} className="h-full bg-indigo-500 transition-all"/></div>}
    </div>
   </section>
  </div>
  <section className={CARD+' space-y-3'}><h2 className="font-semibold">生成结果 <span className="text-xs muted">{outputs.length} 个文件 {exported?'· 已导出':''}</span></h2>
   <div className="grid gap-2 @min-[720px]:grid-cols-2">{outputs.map(r=><div key={r.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3"><FileImage size={17} className="shrink-0 text-indigo-400"/><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="truncate text-xs" title={r.name}>{r.name}</span>{r.variant==='round'&&<span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]">圆角</span>}</div><div className="text-[11px] muted">{formatFile(r.blob.size)} {r.width?('· '+r.width+'×'+r.height):''}</div></div><Button variant="ghost" size="icon" disabled={!ready} title="保存此文件" onClick={()=>void saveOne(r)}><Download size={15}/></Button></div>)}</div>
   {!outputs.length&&<p className="py-6 text-center text-xs muted">上传图片并配置参数，然后点击批量处理</p>}
  </section>
  {error&&<div role="alert" className="flex items-start gap-2 whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400"><AlertTriangle size={16}/>{error}</div>}
  {cropItem&&<ImageCropDialog open src={cropItem.preview} onClose={()=>setCropId(null)} onConfirm={r=>{setItems(v=>v.map(it=>it.id===cropItem.id?{...it,crop:r}:it));setCropId(null);change()}}/>}
  {previewItem&&<ImageCompareDialog item={previewItem} results={previewResults} onClose={()=>setPreviewId(null)}/>}
  <DropOverlay visible={dropOver} />
 </div>
}
