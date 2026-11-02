import {useEffect,useRef,useState} from 'react'
import {AlertTriangle,CheckCircle2,Download,ImagePlus,LoaderCircle,QrCode,ShieldAlert,Trash2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {ColorField} from '@/components/ui/color-field'
import {useDialog} from '@/components/ui/dialog-provider'
import {QR_THEMES,QR_SIZES,QR_DOT_STYLES,QR_EYE_STYLES,defaultQrConfig,qrPayload,validateQrConfig,effectiveEcc,type QrConfig} from '@/lib/qr/config'
import {processQrLogo} from '@/lib/qr/logo'
import {qrBlob,type QrSnapshot,type QrExportFormat} from '@/lib/qr/render'
import {verifyQrBlob,type ScanResult} from '@/lib/qr/verify'
import {useWindowFileDrop,DropOverlay} from '@/hooks/useWindowFileDrop'
const CARD='min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5'
type Rendered={snapshot:QrSnapshot;url:string;scan:ScanResult}
const safeText=(n:number)=>Number.isFinite(n)?String(n):''
export function QrCodeToolPage(){
 const dialog=useDialog()
 const [cfg,setCfg]=useState<QrConfig>(defaultQrConfig)
 const [logoFile,setLogoFile]=useState<File|null>(null),[logo,setLogo]=useState<string|undefined>()
 const [rendered,setRendered]=useState<Rendered|null>(null)
 const [status,setStatus]=useState<'idle'|'rendering'|'valid'|'warning'|'failed'>('idle')
 const [error,setError]=useState(''),[logoError,setLogoError]=useState('')
 const [format,setFormat]=useState<QrExportFormat>('png')
 const [touched,setTouched]=useState(false),[exported,setExported]=useState(false)
 const revision=useRef(0),previewRef=useRef<string|null>(null),logoReq=useRef(0)
 const currentRevision=revision.current
 const busy=status==='rendering'
 const stale=!rendered||rendered.snapshot.revision!==currentRevision
 const valid=Boolean(rendered&&!stale&&rendered.scan.ok)
 const risky=Boolean(rendered&&!stale&&!rendered.scan.ok)
 const update=(patch:Partial<QrConfig>)=>{revision.current++;setCfg(old=>({...old,...patch}));setTouched(true);setExported(false)}
 useEffect(()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:touched&&!exported}));return()=>{window.dispatchEvent(new CustomEvent('tooldock:unsaved',{detail:false}))}},[touched,exported])
 useEffect(()=>()=>{revision.current++;logoReq.current++;if(previewRef.current)URL.revokeObjectURL(previewRef.current)},[])
 useEffect(()=>{
  const id=++logoReq.current
  if(!logoFile){setLogo(undefined);setLogoError('');return}
  setLogo(undefined);setLogoError('')
  void processQrLogo(logoFile,cfg.logoRadius).then(data=>{if(id===logoReq.current)setLogo(data)}).catch(e=>{if(id===logoReq.current){setLogoError(String(e));setLogoFile(null);update({withLogo:false})}})
 },[logoFile,cfg.logoRadius])
 useEffect(()=>{
  const id=++revision.current
  let canceled=false
  setRendered(null);setStatus('rendering');setError('')
  if(cfg.withLogo&&logoFile&&!logo){return()=>{canceled=true}}
  const timer=setTimeout(async()=>{
   try{
    const snapshot:QrSnapshot={config:{...cfg},logo,revision:id}
    validateQrConfig(snapshot.config)
    const blob=await qrBlob(snapshot,'png')
    const scan=await verifyQrBlob(blob,qrPayload(snapshot.config))
    if(canceled||id!==revision.current)return
    const url=URL.createObjectURL(blob)
    if(previewRef.current)URL.revokeObjectURL(previewRef.current)
    previewRef.current=url
    setRendered({snapshot,url,scan});setStatus(scan.ok?'valid':'warning')
   }catch(e){if(!canceled&&id===revision.current){setError(e instanceof Error?e.message:String(e));setStatus('failed')}}
  },200)
  return()=>{canceled=true;clearTimeout(timer)}
 },[cfg,logo,logoFile])
 const setTheme=(id:string)=>{
  const theme=QR_THEMES.find(t=>t.id===id)
  if(theme)update({theme:theme.id,dark:theme.dark,background:theme.background,accent:theme.accent})
 }
 const setColor=(key:'dark'|'background'|'accent',color:string)=>update({[key]:color,theme:'custom'})
 const changeLogo=(file:File|null)=>{
  setLogoFile(file);setLogo(undefined);setLogoError('')
  update({withLogo:Boolean(file)})
 }
 const save=async()=>{
  if(!rendered||stale||busy||status==='failed')return
  const snapshot=rendered.snapshot
  const savedFormat=format
  if(risky){
   const accepted=await dialog.confirm({title:'本地扫码验证失败',description:(rendered.scan.ok?'':rendered.scan.reason)+'。此二维码可能无法被部分设备识别，仍要导出当前配置的 '+savedFormat.toUpperCase()+' 文件吗？',variant:'warning',confirmText:'我了解风险，仍然导出'})
   if(!accepted||snapshot.revision!==revision.current)return
  }
  let token:string|null=null
  try{
   const blob=await qrBlob(snapshot,savedFormat)
   if(snapshot.revision!==revision.current)return
   // For bitmap formats verify the actual file rather than a different QR matrix.
   if(savedFormat!=='svg'){
    const check=await verifyQrBlob(blob,qrPayload(snapshot.config))
    if(!check.ok&&valid){setError('最终导出文件的本地扫码验证失败：'+check.reason);return}
   }
   token=await window.toolDock.export.start('tooldock-qr-code.'+savedFormat,savedFormat)
   if(!token)return
   for(let offset=0;offset<blob.size;offset+=512*1024){
    if(snapshot.revision!==revision.current)throw Error('配置已改变，导出已取消')
    const bytes=new Uint8Array(await blob.slice(offset,offset+512*1024).arrayBuffer())
    await window.toolDock.export.chunk(token,bytes)
   }
   await window.toolDock.export.finish(token)
   token=null;setExported(true);setError('')
  }catch(e){setError('保存失败：'+String(e))}
  finally{if(token)await window.toolDock.export.cancel(token).catch(()=>{})}
 }
 const bytes=new TextEncoder().encode(cfg.kind==='url'?cfg.url.trim():cfg.text).length
 const dropOver=useWindowFileDrop(files=>{const found=files.find(f=>/\.(png|jpe?g|webp)$/i.test(f.name)&&f.size>0&&f.size<=2*1024*1024);if(found){changeLogo(found);if(files.length>1)setLogoError('只使用第一张有效图片')}else setLogoError('请拖入不超过 2 MiB 的 PNG、JPG 或 WebP 图片')})
 return <div className="relative @container mx-auto max-w-[1520px] space-y-4 p-5">
  <header className="flex flex-wrap items-center gap-3"><span className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={24}/></span>
   <div className="flex-1"><h1 className="text-xl font-semibold">二维码工具</h1><p className="mt-1 text-xs muted">文字与链接 · 主题 · 配色 · Logo · 纯本地生成</p></div>
   <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs muted">不上传数据</span>
  </header>
  <div className="grid items-start gap-4 @min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
   <div className="min-w-0 space-y-4">
    <section className={CARD}>
     <div className="flex items-center justify-between"><h2 className="font-semibold">二维码内容</h2><span className="text-xs muted">{bytes} / 900 字节</span></div>
     <div role="group" aria-label="二维码内容类型" className="flex flex-wrap gap-2">{(['url','text'] as const).map(t=><Button key={t} size="sm" variant={cfg.kind===t?'primary':'ghost'} onClick={()=>update({kind:t})}>{t==='url'?'网址链接':'普通文本'}</Button>)}</div>
     {cfg.kind==='url'?<input aria-label="二维码网址" className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-sm" placeholder="https://example.com" value={cfg.url} onChange={e=>update({url:e.target.value})}/>:
      <textarea aria-label="二维码文本" className="min-h-32 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-sm" placeholder="输入文字、中文、Emoji 或换行" value={cfg.text} onChange={e=>update({text:e.target.value})}/>}
    </section>
    <section className={CARD}>
     <h2 className="font-semibold">主题与颜色</h2>
     <div className="grid grid-cols-3 gap-2 @min-[700px]:grid-cols-6">{QR_THEMES.map(t=><button key={t.id} title={t.name} onClick={()=>setTheme(t.id)} className={'rounded-xl border p-2 text-center transition-colors '+(cfg.theme===t.id?'border-indigo-400 bg-indigo-500/10':'border-[var(--border)] hover:border-indigo-400/50')}>
      <span className="mx-auto mb-2 flex h-12 w-full items-center justify-center rounded-lg" style={{background:t.background}}><QrCode size={29} color={t.dark}/></span><span className="text-[11px]">{t.name}</span>
     </button>)}</div>
     <div className="grid grid-cols-3 gap-2"><ColorField label="点阵颜色" value={cfg.dark} onChange={v=>setColor('dark',v)}/><ColorField label="背景颜色" value={cfg.background} onChange={v=>setColor('background',v)}/><ColorField label="定位角颜色" value={cfg.accent} onChange={v=>setColor('accent',v)}/></div>
     <p className="text-[11px] muted">点阵和定位角必须比背景更深，且两者对比度均不少于 4.5:1。</p>
    </section>
    <section className={CARD}>
     <h2 className="font-semibold">模块与输出样式</h2>
     <div className="grid gap-3 @min-[640px]:grid-cols-2">
      <div><p className="mb-2 text-xs muted">点阵形状</p><SelectField ariaLabel="二维码点阵样式" value={cfg.dotStyle} onValueChange={v=>update({dotStyle:v as QrConfig['dotStyle']})} options={QR_DOT_STYLES.map(s=>({value:s.id,label:s.label}))} className="w-full"/></div>
      <div><p className="mb-2 text-xs muted">定位角样式</p><SelectField ariaLabel="二维码定位角样式" value={cfg.eyeStyle} onValueChange={v=>update({eyeStyle:v as QrConfig['eyeStyle']})} options={QR_EYE_STYLES.map(s=>({value:s.id,label:s.label}))} className="w-full"/></div>
     </div>
     <div className="space-y-2"><p className="text-xs muted">导出尺寸</p><div className="flex flex-wrap gap-2">{QR_SIZES.map(size=><Button key={size} size="sm" variant={cfg.size===size?'primary':'ghost'} onClick={()=>update({size})}>{size}</Button>)}</div>
      <label className="flex items-center gap-2 text-xs muted">自定义 px <input aria-label="二维码自定义尺寸" type="number" min={128} max={2048} step={1} value={safeText(cfg.size)} onChange={e=>update({size:Number(e.target.value)})} className="h-9 w-28 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-2 text-xs"/></label>
     </div>
     <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cfg.eccAuto} onChange={e=>update({eccAuto:e.target.checked})}/> 自动纠错</label><div className="min-w-40 flex-1"><SelectField ariaLabel="纠错等级" disabled={cfg.eccAuto} value={cfg.eccAuto?effectiveEcc(cfg):cfg.ecc} onValueChange={v=>update({ecc:v as QrConfig['ecc']})} options={(['L','M','Q','H'] as const).map(v=>({value:v,label:v+' 级纠错'}))} className="w-full"/></div><span className="text-xs muted">当前 {effectiveEcc(cfg)}</span></div>
    </section>
    <section className={CARD}>
     <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">中心 Logo</h2>{logoFile&&<Button size="sm" variant="ghost" onClick={()=>changeLogo(null)}><Trash2 size={15}/> 移除 Logo</Button>}</div>
     <label className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel-alt)] p-4 hover:border-[var(--primary)]/50">
      <ImagePlus size={22} className="text-indigo-400"/><span className="min-w-0 truncate text-xs">{logoFile?logoFile.name:'选择 PNG / JPG / WebP 图片（最大 2 MiB）'}</span>
      <input aria-label="上传二维码 Logo" type="file" className="sr-only" accept=".png,.jpg,.jpeg,.webp" onChange={e=>{const f=e.target.files?.[0];if(f)changeLogo(f);e.currentTarget.value=''}}/>
     </label>
     {logoError&&<p role="alert" className="text-xs text-red-400">{logoError}</p>}
     {logoFile&&<div className="space-y-3"><label className="block text-xs muted">Logo 占比 {Math.round(cfg.logoSize*100)}%<input type="range" min={10} max={20} value={cfg.logoSize*100} onChange={e=>update({logoSize:Number(e.target.value)/100})} className="mt-1 block w-full"/></label>
      <label className="block text-xs muted">Logo 圆角 {cfg.logoRadius}%<input type="range" min={0} max={50} value={cfg.logoRadius} onChange={e=>update({logoRadius:Number(e.target.value)})} className="mt-1 block w-full"/></label></div>}
     <p className="text-[11px] muted">Logo 会生成带白色保护背景的内嵌 PNG；启用后自动使用 H 级纠错。</p>
    </section>
   </div>
   <section className={CARD+' @min-[1000px]:sticky @min-[1000px]:top-4'}>
    <div className="flex items-center justify-between"><h2 className="font-semibold">实时预览</h2><span className="text-xs muted">{cfg.size} × {cfg.size}px</span></div>
    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">
     {rendered&&!stale?<img alt="生成的二维码" src={rendered.url} className="max-h-full max-w-full object-contain"/>:<div className="flex flex-col items-center gap-3 text-center text-xs muted">{busy?<LoaderCircle size={28} className="animate-spin"/>:<ShieldAlert size={28}/>}<span>{busy?'本地生成与扫码验证中…':'尚无可导出的有效预览'}</span></div>}
    </div>
    {rendered&&!stale&&(rendered.scan.ok?<p role="status" className="flex items-center gap-2 text-xs text-emerald-500"><CheckCircle2 size={16}/> 本地扫码验证通过（不代表所有设备一定可扫）</p>:<p role="alert" className="flex items-start gap-2 text-xs text-amber-400"><AlertTriangle size={16} className="shrink-0"/>{rendered.scan.reason}</p>)}
    {error&&<p role="alert" className="whitespace-pre-wrap rounded-lg border border-red-500/30 p-3 text-xs text-red-400">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
     <SelectField ariaLabel="二维码导出格式" value={format} onValueChange={v=>setFormat(v as QrExportFormat)} options={[{value:'png',label:'PNG 高清图片'},{value:'webp',label:'WebP 图片'},{value:'svg',label:'SVG 矢量文件'}]}/>
     <Button variant="primary" disabled={busy||stale||(!valid&&!risky)} onClick={()=>void save()}><Download size={15}/> {risky?'知悉风险并导出':'导出二维码'}</Button>
    </div>
    <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-xs muted">
     <p>内容：{bytes} 字节 · 纠错等级：{effectiveEcc(cfg)} · {cfg.withLogo?'内嵌 Logo':'无 Logo'}</p>
     <p className="mt-1">纯色二维码，支持自定义模块和定位角；无需联网。</p>
    </div>
    {exported&&<p role="status" className="text-xs text-emerald-400">二维码已保存到所选文件位置。</p>}
   </section>
  </div>
  <DropOverlay visible={dropOver} />
 </div>
}
