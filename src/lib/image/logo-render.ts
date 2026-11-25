import {clampCornerRadiusPercent,cornerRadiusPx,fitRect,type CropRect,type FitMode} from './geometry'
import {createIco} from './ico'
import type {ImageFormat} from './export'

export interface LogoVariant{
 stem:string
 radiusPercent:number
 isRoundVariant:boolean
}

export interface LogoOutputItem{
 name:string
 blob:Blob
 format:'png'|'jpg'|'webp'|'ico'
 width:number
 height:number
 variant:'default'|'round'
 radiusPercent:number
}

export type DrawableImageSource=ImageBitmap|HTMLImageElement|HTMLCanvasElement|OffscreenCanvas
export type Canvas2DContext=CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D

/**
 * 规划单张源图在 Logo / ICO 模式下需要生成的输出变体集合。
 * 仅当开启独立输出且圆角大于 0% 时生成直角原版与 `_round` 圆角版两套文件。
 */
export function buildLogoVariants(stem:string,radiusPercent:number,dualRoundOutput:boolean):LogoVariant[]{
 const clamped=clampCornerRadiusPercent(radiusPercent)
 if(dualRoundOutput&&clamped>0){
  return [
   {stem,radiusPercent:0,isRoundVariant:false},
   {stem:`${stem}_round`,radiusPercent:clamped,isRoundVariant:true}
  ]
 }
 return [{stem,radiusPercent:clamped,isRoundVariant:clamped>0}]
}

/**
 * 按选定尺寸、格式及圆角变体规则生成 Logo 与多帧 ICO 输出集合。
 */
export async function generateLogoOutputs(params:{
 stem:string
 sizes:number[]
 formats:string[]
 cornerRadiusPercent?:number
 dualRoundOutput?:boolean
 renderBlob:(size:number,format:ImageFormat,radiusPercent:number)=>Promise<Blob>
 onOutput?:(item:LogoOutputItem)=>void
}):Promise<LogoOutputItem[]>{
 const results:LogoOutputItem[]=[]
 const sortedSizes=params.sizes.slice().sort((a,b)=>a-b)
 const variants=buildLogoVariants(params.stem,params.cornerRadiusPercent??0,Boolean(params.dualRoundOutput))
 const includeIco=params.formats.includes('ico')
 const imageFormats=params.formats.filter(x=>x!=='ico') as ImageFormat[]

 for(const fmt of imageFormats){
  if(!['png','jpeg','webp'].includes(fmt))throw Error('输出格式无效')
 }

 for(const variant of variants){
  const frames:{size:number;png:Uint8Array}[]=[]
  const tag:LogoOutputItem['variant']=variant.isRoundVariant?'round':'default'
  for(const size of sortedSizes){
   if(!Number.isInteger(size)||size<1||size>1024)throw Error('图标尺寸不正确')
   if(includeIco&&size<=256){
    const pngBlob=await params.renderBlob(size,'png',variant.radiusPercent)
    frames.push({size,png:new Uint8Array(await pngBlob.arrayBuffer())})
   }
   for(const fmt of imageFormats){
    const blob=await params.renderBlob(size,fmt,variant.radiusPercent)
    const ext=fmt==='jpeg'?'jpg':fmt
    const item:LogoOutputItem={
     name:`${variant.stem}_${size}x${size}.${ext}`,
     blob,
     format:ext,
     width:size,
     height:size,
     variant:tag,
     radiusPercent:variant.radiusPercent
    }
    params.onOutput?.(item)
    results.push(item)
   }
  }
  if(includeIco){
   if(!frames.length)throw Error('ICO 必须选择至少一个 256px 及以下的尺寸')
   const data=createIco(frames)
   const item:LogoOutputItem={
    name:`${variant.stem}.ico`,
    blob:new Blob([new Uint8Array(data)],{type:'image/x-icon'}),
    format:'ico',
    width:0,
    height:0,
    variant:tag,
    radiusPercent:variant.radiusPercent
   }
   params.onOutput?.(item)
   results.push(item)
  }
 }
 return results
}

function traceRoundedRect(ctx:Canvas2DContext,width:number,height:number,radius:number){
 ctx.beginPath()
 if(typeof ctx.roundRect==='function'){
  ctx.roundRect(0,0,width,height,radius)
  return
 }
 const r=Math.min(radius,width/2,height/2)
 ctx.moveTo(r,0)
 ctx.lineTo(width-r,0)
 ctx.arcTo(width,0,width,r,r)
 ctx.lineTo(width,height-r)
 ctx.arcTo(width,height,width-r,height,r)
 ctx.lineTo(r,height)
 ctx.arcTo(0,height,0,height-r,r)
 ctx.lineTo(0,r)
 ctx.arcTo(0,0,r,0,r)
 ctx.closePath()
}

export interface DrawFittedImageOptions{
 ctx:Canvas2DContext
 source:DrawableImageSource
 sourceWidth:number
 sourceHeight:number
 width:number
 height:number
 fit:FitMode
 crop?:CropRect
 radiusPercent?:number
 fillBackground?:string
}

/**
 * 统一执行适配裁剪、圆角遮罩与高画质缩放绘制，供 Worker、主线程降级导出及实时预览复用。
 */
export function drawFittedImage({
 ctx,
 source,
 sourceWidth,
 sourceHeight,
 width,
 height,
 fit,
 crop,
 radiusPercent=0,
 fillBackground
}:DrawFittedImageOptions){
 ctx.clearRect(0,0,width,height)
 if(fillBackground){
  ctx.fillStyle=fillBackground
  ctx.fillRect(0,0,width,height)
 }
 const radius=cornerRadiusPx(Math.min(width,height),radiusPercent)
 const base=crop||{x:0,y:0,width:sourceWidth,height:sourceHeight}
 const rect=fitRect(base.width,base.height,width,height,fit)

 ctx.save()
 if(radius>0){
  traceRoundedRect(ctx,width,height,radius)
  ctx.clip()
 }
 ctx.imageSmoothingEnabled=true
 ctx.imageSmoothingQuality='high'
 ctx.drawImage(
  source,
  base.x+rect.sx,
  base.y+rect.sy,
  rect.sw,
  rect.sh,
  rect.dx,
  rect.dy,
  rect.dw,
  rect.dh
 )
 ctx.restore()
}

/**
 * 绘制无图片导入时的实时预览内置几何示例源图。
 */
export function paintDemoLogoSource(canvas:HTMLCanvasElement,size=256){
 canvas.width=size
 canvas.height=size
 const ctx=canvas.getContext('2d')
 if(!ctx)return
 const bg=ctx.createLinearGradient(0,0,size,size)
 bg.addColorStop(0,'#1e294f')
 bg.addColorStop(0.55,'#394eb8')
 bg.addColorStop(1,'#14b8d4')
 ctx.fillStyle=bg
 ctx.fillRect(0,0,size,size)

 // 叠加坡度网格与几何模块，使圆角与圆形裁切变化一目了然
 ctx.strokeStyle='rgba(255,255,255,0.14)'
 ctx.lineWidth=Math.max(1,size/128)
 const step=size/4
 for(let i=1;i<4;i++){
  const pos=i*step
  ctx.beginPath();ctx.moveTo(pos,0);ctx.lineTo(pos,size);ctx.stroke()
  ctx.beginPath();ctx.moveTo(0,pos);ctx.lineTo(size,pos);ctx.stroke()
 }

 ctx.fillStyle='rgba(255,255,255,0.92)'
 const pad=size*0.24
 const block=size*0.22
 const gap=size*0.08
 const r=size*0.055
 const drawBlock=(x:number,y:number,w:number,h:number,alpha:number)=>{
  ctx.save()
  ctx.globalAlpha=alpha
  ctx.beginPath()
  if(typeof ctx.roundRect==='function')ctx.roundRect(x,y,w,h,r)
  else ctx.rect(x,y,w,h)
  ctx.fill()
  ctx.restore()
 }
 drawBlock(pad,pad,block*2+gap,block,0.95)
 drawBlock(pad,pad+block+gap,block,block,0.78)
 drawBlock(pad+block+gap,pad+block+gap,block,block,0.6)
}
