import {useEffect,useRef,useState} from 'react'
import {clampCornerRadiusPercent,type CropRect,type FitMode} from '@/lib/image/geometry'
import {drawFittedImage,paintDemoLogoSource} from '@/lib/image/logo-render'

type BackdropMode='checker'|'dark'|'light'

const BACKDROP_OPTIONS:readonly {id:BackdropMode;label:string}[]=[
 {id:'checker',label:'透明格'},
 {id:'dark',label:'深色底'},
 {id:'light',label:'浅色底'}
]

const CHECKER_STYLE={
 backgroundColor:'#e5e7eb',
 backgroundImage:'linear-gradient(45deg, rgba(15,23,42,0.14) 25%, transparent 25%), linear-gradient(-45deg, rgba(15,23,42,0.14) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(15,23,42,0.14) 75%), linear-gradient(-45deg, transparent 75%, rgba(15,23,42,0.14) 75%)',
 backgroundSize:'16px 16px',
 backgroundPosition:'0 0, 0 8px, 8px -8px, -8px 0'
} as const

export interface LogoRoundPreviewProps{
 previewUrl?:string
 previewName?:string
 stem?:string
 crop?:CropRect
 fit:FitMode
 radiusPercent:number
 dualRoundOutput:boolean
 jpegOnly:boolean
}

const PREVIEW_SIZE=132

/**
 * Logo / ICO 实时圆角预览卡片：使用共享 Canvas 裁剪规则同步渲染，支持透明格与深浅底切换。
 */
export function LogoRoundPreview({
 previewUrl,
 previewName,
 stem,
 crop,
 fit,
 radiusPercent,
 dualRoundOutput,
 jpegOnly
}:LogoRoundPreviewProps){
 const canvasRef=useRef<HTMLCanvasElement>(null)
 const demoCanvasRef=useRef<HTMLCanvasElement|null>(null)
 const [loadedImage,setLoadedImage]=useState<{url:string;el:HTMLImageElement}|null>(null)
 const [backdrop,setBackdrop]=useState<BackdropMode>('checker')

 useEffect(()=>{
  if(!previewUrl){setLoadedImage(null);return}
  let cancelled=false
  const img=new Image()
  img.onload=()=>{if(!cancelled)setLoadedImage({url:previewUrl,el:img})}
  img.onerror=()=>{if(!cancelled)setLoadedImage(null)}
  img.src=previewUrl
  return()=>{cancelled=true}
 },[previewUrl])

 useEffect(()=>{
  const canvas=canvasRef.current
  if(!canvas)return
  const dpr=Math.min(2,window.devicePixelRatio||1)
  const px=Math.round(PREVIEW_SIZE*dpr)
  if(canvas.width!==px||canvas.height!==px){
   canvas.width=px
   canvas.height=px
  }
  const ctx=canvas.getContext('2d')
  if(!ctx)return

  const activeImg=previewUrl&&loadedImage?.url===previewUrl?loadedImage.el:null
  if(activeImg&&activeImg.naturalWidth>0&&activeImg.naturalHeight>0){
   drawFittedImage({
    ctx,
    source:activeImg,
    sourceWidth:activeImg.naturalWidth,
    sourceHeight:activeImg.naturalHeight,
    width:px,
    height:px,
    fit,
    crop,
    radiusPercent,
    fillBackground:jpegOnly?'#fff':undefined
   })
   return
  }

  if(!demoCanvasRef.current){
   demoCanvasRef.current=document.createElement('canvas')
   paintDemoLogoSource(demoCanvasRef.current,256)
  }
  const demo=demoCanvasRef.current
  drawFittedImage({
   ctx,
   source:demo,
   sourceWidth:demo.width,
   sourceHeight:demo.height,
   width:px,
   height:px,
   fit,
   radiusPercent,
   fillBackground:jpegOnly?'#fff':undefined
  })
 },[previewUrl,loadedImage,fit,crop,radiusPercent,jpegOnly])

 const clamped=clampCornerRadiusPercent(radiusPercent)
 const shapeLabel=clamped===0?'直角':clamped===50?'正圆':'圆角 '+clamped+'%'
 const baseStem=(stem||'icon').trim()||'icon'

 const stageStyle=backdrop==='checker'?CHECKER_STYLE:backdrop==='dark'?{backgroundColor:'#11141c'}:{backgroundColor:'#f3f4f6'}

 return (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3">
   <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
    <div className="min-w-0">
     <div className="text-xs font-medium">实时效果预览</div>
     <div className="truncate text-[11px] muted" title={previewName||'内置几何示例'}>
      {previewName?previewName:'未导入图片 · 显示内置示例'}
     </div>
    </div>
    <div className="flex rounded-lg border border-[var(--border)] bg-[var(--panel)] p-0.5" role="group" aria-label="预览底色">
     {BACKDROP_OPTIONS.map(opt=>(
      <button
       key={opt.id}
       type="button"
       onClick={()=>setBackdrop(opt.id)}
       className={'rounded-md px-2 py-1 text-[11px] transition-colors '+(backdrop===opt.id?'bg-[var(--selected)] font-medium text-[var(--primary)]':'muted hover:text-[var(--foreground)]')}
      >
       {opt.label}
      </button>
     ))}
    </div>
   </div>

   <div className="flex flex-wrap items-center gap-4">
    <div style={stageStyle} className="flex h-[156px] w-[156px] shrink-0 items-center justify-center rounded-xl border border-[var(--border)] shadow-inner">
     <canvas
      ref={canvasRef}
      style={{width:PREVIEW_SIZE,height:PREVIEW_SIZE}}
      aria-label={'圆角实时预览 '+shapeLabel}
     />
    </div>

    <div className="min-w-[160px] flex-1 space-y-2 text-[11px]">
     <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 font-medium">{shapeLabel}</span>
      <span className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 muted">{fit==='cover'?'居中铺满':'等比留白'}</span>
     </div>

     {dualRoundOutput?(
      clamped>0?(
       <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 muted">
        <div className="truncate">原版：<code className="text-[var(--foreground)]">{baseStem}_*.ext</code> / <code className="text-[var(--foreground)]">{baseStem}.ico</code></div>
        <div className="truncate">圆角：<code className="text-[var(--primary)]">{baseStem}_round_*.ext</code> / <code className="text-[var(--primary)]">{baseStem}_round.ico</code></div>
       </div>
      ):(
       <p className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 muted">
        当前圆角为 0%，仅输出一份直角原版文件。
       </p>
      )
     ):(
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 muted">
       <div className="truncate">输出：<code className="text-[var(--foreground)]">{baseStem}_*.ext</code> / <code className="text-[var(--foreground)]">{baseStem}.ico</code></div>
       {clamped>0&&<div className="mt-0.5 text-[10px] text-[var(--primary)]">将直接以当前圆角（{clamped}%）生成单套文件</div>}
      </div>
     )}
    </div>
   </div>
  </div>
 )
}
