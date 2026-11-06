import {useState} from 'react'
import {Download,FolderOpen,Pause,Play,Plus,RefreshCw,Trash2,X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {DialogShell} from '@/components/ui/dialog-shell'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {useDialog} from '@/components/ui/dialog-provider'
import type {MediaPreferences,MediaSnapshot} from '@/shared/mediaModels'
import {MediaField,MediaProgress,mediaBytes} from './media-ui'

type Run=(action:()=>Promise<unknown>)=>Promise<void>
export function ModelManagerDialog({open,onOpenChange,snapshot,busy,run,onPreferences}:{open:boolean;onOpenChange:(open:boolean)=>void;snapshot:MediaSnapshot;busy:boolean;run:Run;onPreferences:(patch:Partial<MediaPreferences>)=>void}){
 const dialog=useDialog(),api=window.toolDock.media
 const [directoryTarget,setDirectoryTarget]=useState('')
 const locked=busy||snapshot.busy
 const remove=async(id:string,name:string)=>{
  const yes=await dialog.confirm({title:'删除模型？',description:'将移除「'+name+'」。外部引用只移除记录，不删除源文件。',variant:'danger',confirmText:'删除模型'})
  if(yes)await run(()=>api.models.remove(id))
 }
 const chooseDirectory=()=>run(async()=>{
  const path=await api.models.chooseDirectory();if(!path||path===snapshot.preferences.modelDirectory)return
  setDirectoryTarget(path)
 })
 const importModel=async(reference:boolean)=>{
  const yes=await dialog.confirm({title:reference?'引用外部模型？':'导入本地模型？',description:'请选择可信来源的 whisper.cpp GGML 模型。自定义模型将标记为“来源未验证”，不能据此认定其识别质量或兼容性。',confirmText:'选择模型'})
  if(yes)await run(()=>api.models.import(reference))
 }
 return <><DialogShell open={open} onOpenChange={onOpenChange} width="lg" title="模型与识别引擎" description="模型按需下载，媒体内容不会上传。运行任务期间暂停模型、引擎及目录变更。" footer={<Button onClick={()=>onOpenChange(false)}>完成</Button>}>
  <div className="space-y-6">
   <section className="space-y-3"><div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-sm font-semibold">模型保存目录</h3><Button size="sm" disabled={locked} onClick={()=>void chooseDirectory()}><FolderOpen size={14}/>更改目录</Button></div><p className="break-all rounded-lg bg-[var(--panel-alt)] p-3 text-xs muted">{snapshot.preferences.modelDirectory||'默认：用户数据目录 / models / whisper'}</p><p className="text-xs leading-5 muted">目录切换失败时保留原设置；模型文件不纳入普通数据备份。</p></section>
   <section className="space-y-3 border-t border-[var(--border)] pt-5"><div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">加速模型下载</h3><p className="mt-1 text-xs leading-5 muted">默认关闭 · 使用 proxy-d.partialy.cn · 失败自动回退直连</p></div><SwitchField ariaLabel="加速模型下载" checked={snapshot.preferences.accelerationEnabled} disabled={busy} onCheckedChange={accelerationEnabled=>onPreferences({accelerationEnabled})}/></div><MediaField label="分段连接数"><SelectField ariaLabel="模型分段下载连接数" value={String(snapshot.preferences.parallelSegments)} disabled={busy} onValueChange={v=>onPreferences({parallelSegments:Number(v)})} options={[1,2,4,6,8].map(n=>({value:String(n),label:n===1?'单连接':n+' 个连接'}))}/></MediaField><p className="text-xs muted">仅在服务器正确支持 Range 时启用并行，下载后校验 SHA-256。</p></section>
   <section className="space-y-3 border-t border-[var(--border)] pt-5"><div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-sm font-semibold">Whisper 模型</h3><Button size="sm" disabled={locked} onClick={()=>void importModel(false)}><Plus size={14}/>复制导入</Button><Button size="sm" disabled={locked} onClick={()=>void importModel(true)}>引用外部模型</Button></div>
    <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">{snapshot.models.map(model=>{
     const download=snapshot.downloads.find(d=>d.id===model.id),active=download&&['downloading','verifying','paused'].includes(download.state),unavailable=Boolean(model.path&&!model.installed)
     return <div key={model.id} className="space-y-2 p-3"><div className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 text-sm font-medium">{model.name}{model.id==='small'&&<span className="ml-2 text-xs text-indigo-400">推荐</span>}</span><span className="text-xs muted">{mediaBytes(model.bytes)}</span><span className={'text-xs '+(unavailable?'text-red-400':model.installed?'text-emerald-500':'muted')}>{unavailable?'校验失败 / 不可用':model.installed?(model.verified?'已校验':model.reference?'外部引用 · 未验证':'来源未验证'):'未安装'}</span></div>{model.path&&<p title={model.path} className="truncate text-xs muted">{model.path}</p>}
      {active&&<><MediaProgress value={download.total?download.received/download.total*100:0} label={model.name+'下载进度'}/><p className="text-xs muted">{download.state==='verifying'?'正在校验完整性':download.state==='paused'?'已暂停':mediaBytes(download.received)+' / '+mediaBytes(download.total)}</p></>}
      {download?.message&&<p className="break-words text-xs text-amber-500">{download.message}</p>}{download?.error&&<p className="break-words text-xs text-red-400">{download.error}</p>}
      <div className="flex flex-wrap gap-2">{!model.installed&&!model.path&&!active&&<Button size="sm" disabled={locked} onClick={()=>void run(()=>api.models.download(model.id))}><Download size={13}/>{download?.state==='failed'?'重试下载':'下载模型'}</Button>}{download?.state==='downloading'&&<Button size="sm" disabled={busy} onClick={()=>void run(()=>api.models.pause(model.id))}><Pause size={13}/>暂停</Button>}{download?.state==='paused'&&<Button size="sm" disabled={locked} onClick={()=>void run(()=>api.models.resume(model.id))}><Play size={13}/>继续</Button>}{active&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>void run(()=>api.models.cancel(model.id))}><X size={13}/>取消下载</Button>}{(model.installed||model.path)&&<Button size="sm" variant="danger" disabled={locked} onClick={()=>void remove(model.id,model.name)}><Trash2 size={13}/>移除</Button>}</div>
     </div>
    })}</div>
   </section>
   <section className="space-y-3 border-t border-[var(--border)] pt-5"><h3 className="text-sm font-semibold">识别引擎</h3><p className="text-xs leading-6 muted">CPU 引擎：{snapshot.engines.cpuAvailable?'已就绪':'不可用'} · CUDA 引擎：{snapshot.engines.cudaAvailable?'已安装':'未安装'}{snapshot.engines.version?' · '+snapshot.engines.version:''}</p>{snapshot.engines.gpuName&&<p className="text-xs muted">检测显卡：{snapshot.engines.gpuName}{snapshot.engines.gpuMemory?' · '+snapshot.engines.gpuMemory:''}</p>}<p className="text-xs leading-5 muted">CUDA 安装状态不代表推理成功，任务会显示实际使用设备。强制 GPU 模式失败时停止；自动模式会提示并回退 CPU。</p>
    {snapshot.downloads.filter(d=>d.id==='cuda-engine').map(d=><div key={d.id} className="space-y-2"><MediaProgress value={d.total?d.received/d.total*100:0} label="CUDA引擎安装进度"/><p className="text-xs muted">{d.state==='completed'?'安装完成':d.state==='verifying'?'正在校验与安装':mediaBytes(d.received)+' / '+mediaBytes(d.total)}</p>{d.error&&<p className="text-xs text-red-400">{d.error}</p>}</div>)}
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={locked||snapshot.engines.cudaAvailable||snapshot.downloads.some(d=>d.id==='cuda-engine'&&['downloading','verifying'].includes(d.state))} onClick={()=>void run(()=>api.engines.installCuda())}><Download size={14}/>安装 CUDA 引擎</Button>{snapshot.engines.cudaAvailable&&<Button size="sm" variant="danger" disabled={locked} onClick={async()=>{if(await dialog.confirm({title:'移除 CUDA 引擎？',description:'移除后仍可使用 CPU 识别字幕。',variant:'danger',confirmText:'移除'}))await run(()=>api.engines.removeCuda())}}><Trash2 size={14}/>移除 CUDA</Button>}</div>
   </section>
   <section className="space-y-3 border-t border-[var(--border)] pt-5"><h3 className="text-sm font-semibold">FFmpeg</h3><p className="break-all text-xs muted">{snapshot.preferences.ffmpegOverride||'使用内置 FFmpeg（开发版使用已下载的媒体资源）'}</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={locked} onClick={()=>void run(async()=>{await api.chooseFfmpeg()})}><FolderOpen size={14}/>指定 FFmpeg</Button>{snapshot.preferences.ffmpegOverride&&<Button size="sm" disabled={locked} onClick={()=>onPreferences({ffmpegOverride:''})}><RefreshCw size={14}/>恢复默认</Button>}</div></section>
  </div>
 </DialogShell><DialogShell open={!!directoryTarget} onOpenChange={value=>{if(!value)setDirectoryTarget('')}} title="切换模型目录" description="仅切换不复制模型；复制模型并切换会校验已有模型后切换目录，两种方式均保留旧目录文件，外部引用保持不变。" dismissible={!busy} footer={<><Button disabled={busy} onClick={()=>setDirectoryTarget('')}>取消</Button><Button disabled={locked} onClick={()=>void run(async()=>{await api.models.migrateDirectory(directoryTarget,false);setDirectoryTarget('')})}>仅切换目录</Button><Button variant="primary" disabled={locked} onClick={()=>void run(async()=>{await api.models.migrateDirectory(directoryTarget,true);setDirectoryTarget('')})}>复制模型并切换</Button></>}><p className="break-all text-xs leading-6">{directoryTarget}</p></DialogShell></>
}
