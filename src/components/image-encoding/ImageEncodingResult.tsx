import {useEffect,useState} from 'react'
import {Copy,Download,Info} from 'lucide-react'
import {Button} from '@/components/ui/button'
import type {DetectedImage} from '@/lib/image-encoding/format'
export interface EncodingResultState {kind:'encode'|'decode';encoded?:string;bytes?:Uint8Array;image:DetectedImage;size:number;name:string}
export function ImageEncodingResult({result,stale,previewUrl,busy,onCopy,onDownload,onPreviewError}:{
 result:EncodingResultState|null;stale:boolean;previewUrl:string;busy:boolean;onCopy:()=>void;onDownload:()=>void;onPreviewError:()=>void
}){
 const [dimensions,setDimensions]=useState<{width:number;height:number}|null>(null)
 useEffect(()=>setDimensions(null),[previewUrl])
 const fmt=(n:number)=>n>=1048576?(n/1048576).toFixed(2)+' MiB':(n/1024).toFixed(1)+' KiB'
 return <section className="min-w-0 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">转换结果</h2><div className="flex gap-2">
    {result?.kind==='encode'&&<Button size="sm" disabled={stale||busy} onClick={onCopy}><Copy size={14}/> 复制完整编码</Button>}
    <Button size="sm" disabled={!result||stale||busy} onClick={onDownload}><Download size={14}/> {result?.kind==='encode'?'导出 TXT':'保存图片'}</Button>
  </div></div>
  {stale&&result&&<p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-400">输入或编码格式已变化，旧结果已过期，请重新转换。</p>}
  {result?<>
   <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--panel-alt)] p-3 text-xs">
    <div><p className="muted">检测格式</p><p className="mt-1 font-semibold">{result.image.format.toUpperCase()}</p></div>
    <div><p className="muted">原始大小</p><p className="mt-1 font-semibold">{fmt(result.size)}</p></div>
    <div><p className="muted">MIME 类型</p><p className="mt-1 break-all font-mono">{result.image.mime}</p></div>
    <div><p className="muted">尺寸</p><p className="mt-1">{result.image.width&&result.image.height?result.image.width+' × '+result.image.height:dimensions?dimensions.width+' × '+dimensions.height:'待检测'}</p></div>
   </div>
   {previewUrl?<div className="flex min-h-44 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3"><img src={previewUrl} alt="转换图片预览" onLoad={e=>setDimensions({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} onError={onPreviewError} className="max-h-[320px] max-w-full object-contain"/></div>:<div className="flex min-h-28 items-center gap-2 rounded-xl border border-[var(--border)] p-4 text-xs muted"><Info size={17}/> 该格式可能无法在当前 Chromium 中预览，但原始文件字节可以正常保存。</div>}
   {result.encoded!==undefined&&<>
     <p className="text-xs muted">编码长度 {result.encoded.length.toLocaleString()} 字符 · 下方仅展示前 2000 字符</p>
     <textarea aria-label="编码结果预览" spellCheck={false} readOnly value={result.encoded.slice(0,2000)+(result.encoded.length>2000?'\n…（内容已截断，复制和导出仍为全文）':'')} className="h-44 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 font-mono text-xs outline-none"/>
   </>}
  </>:<div className="flex min-h-[310px] items-center justify-center text-center text-xs muted">选择图片或粘贴 Base64，然后点击开始转换。</div>}
 </section>
}
