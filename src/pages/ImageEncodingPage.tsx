import {useEffect,useRef,useState} from 'react'
import {ArrowLeftRight,Binary,Copy,FileCode2,RefreshCw,X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {SelectField} from '@/components/ui/select-field'
import {ImageEncodingInput} from '@/components/image-encoding/ImageEncodingInput'
import {ImageEncodingResult,type EncodingResultState} from '@/components/image-encoding/ImageEncodingResult'
import {startEncodingJob} from '@/lib/image-encoding/worker-client'
import {IMAGE_ENCODING_MAX_BYTES} from '@/lib/image-encoding/format'

const CHUNK=256*1024
type Direction='encode'|'decode'
export function ImageEncodingPage(){
 const [direction,setDirection]=useState<Direction>('encode')
 const [outputMode,setOutputMode]=useState<'data-url'|'base64'>('data-url')
 const [file,setFile]=useState<File|null>(null),[text,setText]=useState('')
 const [result,setResult]=useState<EncodingResultState|null>(null)
 const [version,setVersion]=useState(0),[resultVersion,setResultVersion]=useState(-1)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[exported,setExported]=useState(false)
 const [previewUrl,setPreviewUrl]=useState('')
 const [previewError,setPreviewError]=useState(false)
 const generation=useRef(0),task=useRef<{cancel:()=>void}|null>(null)
 const stale=Boolean(result)&&(version!==resultVersion||result?.kind!==direction)
 const usable=Boolean(result)&&!stale&&!busy
 const unsaved=(Boolean(file)||text.trim().length>0||Boolean(result))&&!exported
 useEffect(()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:unsaved}));return()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:false}))}},[unsaved])
 useEffect(()=>()=>{generation.current++;task.current?.cancel()},[])
 useEffect(()=>{
  setPreviewError(false)
  if(!result){setPreviewUrl('');return}
  let blob:Blob|null=null
  if(result.kind==='decode'&&result.bytes)blob=new Blob([new Uint8Array(result.bytes)],{type:result.image.mime})
  else if(file&&result.kind==='encode')blob=new Blob([file],{type:result.image.mime})
  if(!blob){setPreviewUrl('');return}
  const url=URL.createObjectURL(blob);setPreviewUrl(url)
  return()=>URL.revokeObjectURL(url)
 },[result]) // Input changes leave old (stale) result unchanged, avoiding mismatched previews.
 const change=()=>{generation.current++;task.current?.cancel();task.current=null;setVersion(v=>v+1);setBusy(false);setExported(false);setError('')}
 const setUploadedFile=(v:File|null)=>{setFile(v);change()}
 const setInputText=(v:string)=>{setText(v);change()}
 const changeDirection=(v:Direction)=>{if(v===direction)return;setDirection(v);change()}
 const start=async()=>{
  if(busy)return
  if(direction==='encode'&&(!file||file.size<1||file.size>IMAGE_ENCODING_MAX_BYTES)){setError('请选择不超过 20 MiB 的图片');return}
  if(direction==='decode'&&!text.trim()){setError('请粘贴 Base64 内容');return}
  const id=++generation.current,currentVersion=version
  setBusy(true);setError('');setExported(false)
  let active:ReturnType<typeof startEncodingJob>|undefined
  try{
   active=startEncodingJob(direction==='encode'
    ?{id,kind:'encode',file:file!,mode:outputMode}
    :{id,kind:'decode',text})
   task.current=active
   const answer=await active.promise
   if(generation.current!==id)return
   if(answer.kind==='encode'){
    setResult({kind:'encode',encoded:answer.output,image:answer.image,size:answer.size,name:file!.name})
   }else{
    setResult({kind:'decode',bytes:answer.bytes,image:answer.image,size:answer.size,name:'restored-image.'+answer.image.extension})
   }
   setResultVersion(currentVersion)
  }catch(e){if(generation.current===id)setError(e instanceof Error?e.message:String(e))}
  finally{if(generation.current===id){task.current=null;setBusy(false)}}
 }
 const copy=async()=>{
  if(!usable||result?.kind!=='encode'||!result.encoded)return
  try{await navigator.clipboard.writeText(result.encoded);setExported(true);setError('')}
  catch(e){setError('复制失败：'+String(e))}
 }
 const save=async()=>{
  if(!usable||!result)return
  const fmt=result.kind==='encode'?'txt':result.image.extension
  const filename=result.kind==='encode'?result.name.replace(/\.[^.]+$/,'')+'_base64.txt':result.name
  let id:string|null=null
  try{
   id=await window.toolDock.export.start(filename,fmt as 'txt'|'png'|'jpg'|'webp'|'gif'|'bmp'|'ico')
   if(!id)return
   if(result.kind==='encode'&&result.encoded!==undefined){
    for(let pos=0;pos<result.encoded.length;pos+=CHUNK){
     const chunk=result.encoded.slice(pos,pos+CHUNK)
     await window.toolDock.export.chunk(id,new TextEncoder().encode(chunk))
    }
   }else if(result.bytes){
    for(let pos=0;pos<result.bytes.length;pos+=CHUNK)await window.toolDock.export.chunk(id,result.bytes.slice(pos,pos+CHUNK))
   }
   await window.toolDock.export.finish(id);setExported(true);setError('')
  }catch(e){if(id)await window.toolDock.export.cancel(id).catch(()=>{});setError('导出失败：'+String(e))}
 }
 const reset=()=>{setFile(null);setText('');setResult(null);setResultVersion(-1);change()}
 return <div className="@container mx-auto max-w-[1480px] space-y-4 p-5">
  <header className="flex flex-wrap items-center gap-3">
   <span className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={23}/></span>
   <div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">图片编码</h1><p className="mt-1 text-xs muted">图片与 Base64 / Data URL 双向无损转换 · 纯本地、不上传</p></div>
   <Button variant="ghost" onClick={reset}><X size={15}/> 清空工作区</Button>
  </header>
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
   <div role="group" aria-label="转换方向" className="flex gap-1 rounded-xl bg-[var(--panel-alt)] p-1">
    <Button size="sm" variant={direction==='encode'?'primary':'ghost'} onClick={()=>changeDirection('encode')}><Binary size={15}/> 图片 → Base64</Button>
    <Button size="sm" variant={direction==='decode'?'primary':'ghost'} onClick={()=>changeDirection('decode')}><ArrowLeftRight size={15}/> Base64 → 图片</Button>
   </div>
   {direction==='encode'&&<SelectField ariaLabel="Base64 输出格式" value={outputMode} onValueChange={v=>{setOutputMode(v as typeof outputMode);change()}} options={[{value:'data-url',label:'Data URL（默认）'},{value:'base64',label:'纯 Base64'}]}/>}
   <div className="flex items-center gap-2"><Button variant="primary" disabled={busy||(direction==='encode'?!file:!text.trim())} onClick={()=>void start()}><RefreshCw size={15}/>{busy?'转换中…':'开始转换'}</Button>{busy&&<Button onClick={()=>{generation.current++;task.current?.cancel();task.current=null;setBusy(false)}}>取消</Button>}</div>
  </div>
  <div className="grid gap-4 @min-[930px]:grid-cols-2">
   <ImageEncodingInput direction={direction} file={file} text={text} onFile={setUploadedFile} onText={setInputText} onError={setError}/>
   <ImageEncodingResult result={result} stale={stale||Boolean(result&&result.kind!==direction)} previewUrl={previewError?'':previewUrl} busy={busy} onCopy={()=>void copy()} onDownload={()=>void save()} onPreviewError={()=>setPreviewError(true)}/>
  </div>
  {error&&<p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400">{error}</p>}
  {exported&&<p role="status" className="flex items-center gap-2 text-xs text-emerald-500"><Copy size={14}/> 内容已成功复制或保存</p>}
  <p className="text-xs muted">保持源图片的原始字节，GIF 动画、元数据不会因编码转换被重新压缩。大文本只显示前 2000 字符；操作中不使用网络。</p>
 </div>
}
