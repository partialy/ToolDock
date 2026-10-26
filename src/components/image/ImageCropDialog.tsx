import {useEffect,useRef,useState} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import ReactCrop,{type Crop,type PercentCrop} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import {X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import type {CropRect} from '@/lib/image/geometry'
const ratios=[['自由',undefined],['1:1',1],['4:3',4/3],['16:9',16/9],['2:3',2/3],['9:16',9/16]] as const
export function ImageCropDialog({src,open,onClose,onConfirm}:{src:string;open:boolean;onClose:()=>void;onConfirm:(r:CropRect)=>void}){
 const image=useRef<HTMLImageElement>(null)
 const [crop,setCrop]=useState<Crop>({unit:'%',x:0,y:0,width:100,height:100})
 const [area,setArea]=useState<CropRect|null>(null)
 const [zoom,setZoom]=useState(1)
 const [imageSize,setImageSize]=useState({width:0,height:0})
 const [ratio,setRatio]=useState<number|undefined>()
 useEffect(()=>{if(open){setCrop({unit:'%',x:0,y:0,width:100,height:100});setArea(null);setZoom(1);setRatio(undefined)}},[open,src])
 const setPercentArea=(percent:PercentCrop)=>{
  const img=image.current
  if(!img)return
  setArea({x:Math.max(0,Math.round(percent.x/100*img.naturalWidth)),y:Math.max(0,Math.round(percent.y/100*img.naturalHeight)),width:Math.max(1,Math.round(percent.width/100*img.naturalWidth)),height:Math.max(1,Math.round(percent.height/100*img.naturalHeight))})
 }
 const changeField=(key:keyof CropRect,value:number)=>{
  const img=image.current;if(!img||!area||!Number.isFinite(value))return
  const next={...area,[key]:Math.max(key==='width'||key==='height'?1:0,Math.round(value))}
  next.x=Math.min(next.x,img.naturalWidth-1);next.y=Math.min(next.y,img.naturalHeight-1)
  next.width=Math.min(next.width,img.naturalWidth-next.x);next.height=Math.min(next.height,img.naturalHeight-next.y)
  setArea(next)
  setCrop({unit:'%',x:next.x/img.naturalWidth*100,y:next.y/img.naturalHeight*100,width:next.width/img.naturalWidth*100,height:next.height/img.naturalHeight*100})
 }
 return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose()}}>
  <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[260] bg-black/70 backdrop-blur-sm"/>
   <Dialog.Content className="fixed inset-3 z-[261] mx-auto flex max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl sm:inset-8">
    <div className="flex items-center justify-between border-b border-[var(--border)] p-4"><Dialog.Title className="font-semibold">交互式非破坏裁剪</Dialog.Title><Dialog.Close aria-label="关闭" className="rounded-lg p-2 hover:bg-[var(--hover)]"><X size={17}/></Dialog.Close></div>
    <div className="flex min-h-[180px] flex-1 items-center justify-center overflow-auto bg-neutral-950 p-4">
     <ReactCrop crop={crop} onChange={(px,percent)=>{setCrop(px);setPercentArea(percent)}} aspect={ratio} keepSelection>
      <img ref={image} src={src} alt="待裁剪图片" onLoad={e=>{const im=e.currentTarget;setImageSize({width:im.naturalWidth,height:im.naturalHeight});setArea({x:0,y:0,width:im.naturalWidth,height:im.naturalHeight})}} style={{width:imageSize.width?Math.max(1,Math.round(imageSize.width*Math.min(8,Math.min(820/imageSize.width,540/imageSize.height))*zoom))+'px':'auto',maxWidth:'none',maxHeight:'none',display:'block'}}/>
     </ReactCrop>
    </div>
    <div className="space-y-3 border-t border-[var(--border)] p-3"><div className="flex flex-wrap gap-2">{ratios.map(([label,r])=><Button key={label} size="sm" variant={ratio===r?'primary':'ghost'} onClick={()=>setRatio(r)}>{label}</Button>)}
     <label className="ml-auto flex items-center gap-2 text-xs">缩放 <input aria-label="裁剪视图缩放" type="range" min={1} max={3} step={0.05} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label></div>
     <div className="flex flex-wrap items-end gap-2">
      {area&&(['x','y','width','height'] as const).map(key=><label key={key} className="max-w-24 space-y-1 text-[11px] muted"><span className="block">{({x:'起始 X',y:'起始 Y',width:'选区宽',height:'选区高'} as const)[key]}</span><Input type="number" min={0} value={area[key]} className="h-8 text-xs" onChange={e=>changeField(key,Number(e.target.value))}/></label>)}
      <div className="ml-auto flex gap-2"><Button onClick={()=>{setCrop({unit:'%',x:0,y:0,width:100,height:100});const img=image.current;if(img)setArea({x:0,y:0,width:img.naturalWidth,height:img.naturalHeight});setZoom(1)}}>重置</Button><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!area} onClick={()=>{if(area)onConfirm(area)}}>应用裁剪</Button></div>
     </div>
    </div>
   </Dialog.Content></Dialog.Portal>
 </Dialog.Root>
}
