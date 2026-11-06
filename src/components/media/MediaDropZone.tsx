import {FilePlus2,FolderOpen,UploadCloud} from 'lucide-react'
import {Button} from '@/components/ui/button'

export function MediaDropZone({subtitle,busy,onFiles,onFolder}:{subtitle:boolean;busy:boolean;onFiles:()=>void;onFolder:()=>void}){
 return <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-5 py-5">
  <div className="rounded-xl bg-indigo-500/10 p-3 text-indigo-400"><UploadCloud size={25}/></div>
  <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">拖入{subtitle?'音视频':'视频'}文件或文件夹</h2><p className="mt-1 text-xs leading-5 muted">支持批量添加 · 文件夹仅扫描一级 · 所有媒体在本机处理</p></div>
  <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={onFiles}><FilePlus2 size={16}/>添加文件</Button><Button disabled={busy} onClick={onFolder}><FolderOpen size={16}/>选择文件夹</Button></div>
 </section>
}
