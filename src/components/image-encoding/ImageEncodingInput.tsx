import {useRef} from 'react'
import {FileImage,Upload,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {IMAGE_ENCODING_MAX_BYTES,IMAGE_ENCODING_MAX_TEXT} from '@/lib/image-encoding/format'
const fmt=(n:number)=>n>=1048576?(n/1048576).toFixed(2)+' MiB':(n/1024).toFixed(1)+' KiB'
export function ImageEncodingInput({direction,file,text,onFile,onText,onError}:{
 direction:'encode'|'decode';file:File|null;text:string;onFile:(file:File|null)=>void;onText:(text:string)=>void;onError:(message:string)=>void
}){
 const ref=useRef<HTMLInputElement>(null)
 const load=(f?:File)=>{
  if(!f)return
  if(f.size<1||f.size>IMAGE_ENCODING_MAX_BYTES){onError('单个图片文件需要大于 0 且不超过 20 MiB');return}
  if(!/\.(png|jpe?g|webp|gif|bmp|ico)$/i.test(f.name)){onError('只支持 PNG、JPEG、WebP、GIF、BMP、ICO');return}
  onFile(f)
 }
 return <section className="min-w-0 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
  <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">输入</h2>{(file||text)&&<Button size="sm" variant="ghost" onClick={()=>{onFile(null);onText('')}}><Trash2 size={14}/> 清空输入</Button>}</div>
  {direction==='encode'?<>
   <button type="button" onClick={()=>ref.current?.click()} className="flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--panel-alt)] p-5 text-center transition-colors hover:border-[var(--primary)]/60 focus-visible:border-[var(--primary)]">
    <Upload size={24} className="text-indigo-400"/><span className="text-sm font-medium">点击或拖拽图片</span><span className="text-xs muted">PNG / JPEG / WebP / GIF / BMP / ICO · 不超过 20 MiB</span>
   </button>
   <input ref={ref} type="file" className="hidden" aria-label="选择需要编码的图片" accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.ico" onChange={e=>{load(e.target.files?.[0]);e.currentTarget.value=''}}/>
   {file&&<div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3"><FileImage size={19} className="text-indigo-400"/><div className="min-w-0 flex-1"><div className="truncate text-xs font-medium">{file.name}</div><div className="mt-1 text-[11px] muted">{fmt(file.size)} · 保留原始文件字节</div></div><Button size="sm" variant="ghost" onClick={()=>onFile(null)}>移除</Button></div>}
  </>:<>
   <label htmlFor="image-base64-input" className="text-xs muted">粘贴纯 Base64 或 data:image/...;base64, 编码</label>
   <textarea id="image-base64-input" aria-label="图片 Base64 输入" spellCheck={false} value={text} onChange={e=>{if(e.target.value.length>IMAGE_ENCODING_MAX_TEXT){onError('文本最多允许 30 MiB，请缩小输入');return}onText(e.target.value)}} placeholder="data:image/png;base64,iVBORw0KGgo..." className="h-[310px] min-h-[180px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 font-mono text-xs outline-none focus:border-[var(--primary)]"/>
   <p className="text-[11px] muted">仅在点击“开始转换”后解析。允许 Base64 中的空格、Tab 和换行。</p>
  </>}
 </section>
}
