import {useEffect,useRef} from 'react'
import type {AudioRange} from '@/shared/audioEditingModels'
import {deletedRanges} from '@/lib/audio-editing/time'
import {getAudioWaveformViewport} from '@/lib/audio-editing/waveform-viewport'

export function AudioWaveformTimeline({points,durationUs,kept,selection,playheadUs,zoom,viewStartUs,onSelect,onSeek,onZoom}:{
 points:number[];durationUs:number;kept:AudioRange[];selection:AudioRange|null;playheadUs:number;
 zoom:number;viewStartUs:number;onSelect:(range:AudioRange)=>void;onSeek:(us:number)=>void;onZoom:(next:number)=>void
}){
 const canvas=useRef<HTMLCanvasElement>(null),start=useRef<number|null>(null)
 const viewport=getAudioWaveformViewport(durationUs,zoom,viewStartUs)
 const visible=viewport.visibleUs
 useEffect(()=>{
  const element=canvas.current;if(!element)return
  const draw=()=>{
   const rect=element.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(100,rect.width),h=150
   element.width=Math.round(w*dpr);element.height=Math.round(h*dpr)
   const ctx=element.getContext('2d');if(!ctx)return
   ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h)
   ctx.fillStyle=getComputedStyle(element).getPropertyValue('--panel-alt').trim()||'#192333'
   ctx.fillRect(0,0,w,h)
   const end=viewport.endUs
   const x=(us:number)=>(us-viewport.startUs)/visible*w
   ctx.strokeStyle='#75a1e8';ctx.lineWidth=Math.max(1,w/Math.max(points.length,1)*.66)
   points.forEach((peak,i)=>{
    const px=i/Math.max(1,points.length-1)*w,amp=Math.max(1,Math.min(.96,peak)*64)
    ctx.beginPath();ctx.moveTo(px,75-amp);ctx.lineTo(px,75+amp);ctx.stroke()
   })
   for(const range of deletedRanges(kept,durationUs)){
    if(range.endUs<viewport.startUs||range.startUs>end)continue
    const left=Math.max(0,x(range.startUs)),right=Math.min(w,x(range.endUs))
    ctx.fillStyle='rgba(240,94,94,.29)';ctx.fillRect(left,0,Math.max(0,right-left),h)
   }
   if(selection){
    const left=Math.max(0,x(selection.startUs)),right=Math.min(w,x(selection.endUs))
    ctx.fillStyle='rgba(157,125,237,.28)';ctx.fillRect(left,0,Math.max(0,right-left),h)
    ctx.strokeStyle='#b59bf2';ctx.lineWidth=1.5
    for(const edge of [left,right]){ctx.beginPath();ctx.moveTo(edge,0);ctx.lineTo(edge,h);ctx.stroke()}
   }
   if(playheadUs>=viewport.startUs&&playheadUs<=end){
    const head=x(playheadUs);ctx.strokeStyle='#f2bd63';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(head,0);ctx.lineTo(head,h);ctx.stroke()
   }
  }
  draw();const observer=new ResizeObserver(draw);observer.observe(element)
  return()=>observer.disconnect()
 },[points,durationUs,kept,selection,playheadUs,viewport.startUs,viewport.endUs,visible])
 const position=(e:React.PointerEvent<HTMLCanvasElement>)=>{
  const rect=e.currentTarget.getBoundingClientRect()
  return Math.max(viewport.startUs,Math.min(viewport.endUs,Math.round(viewport.startUs+(e.clientX-rect.left)/rect.width*visible)))
 }
 return <div className="space-y-2">
  <canvas ref={canvas} className="w-full cursor-crosshair touch-none rounded-xl border border-[var(--border)]" style={{height:150}}
   aria-label="音频波形时间轴，拖动选择片段，单击跳转播放位置"
   onPointerDown={e=>{start.current=position(e);e.currentTarget.setPointerCapture(e.pointerId)}}
   onPointerMove={e=>{if(start.current===null)return;const p=position(e);onSelect({startUs:Math.min(p,start.current),endUs:Math.max(p,start.current)})}}
   onPointerUp={e=>{if(start.current===null)return;const p=position(e),begin=start.current;start.current=null;if(Math.abs(p-begin)<Math.max(10000,visible*.002))onSeek(p);else onSelect({startUs:Math.min(p,begin),endUs:Math.max(p,begin)})}}
   onPointerCancel={()=>{start.current=null}}
   onWheel={e=>{if(e.ctrlKey)onZoom(Math.max(1,Math.min(32,zoom+(e.deltaY<0?1:-1))))}}/>
  <div className="flex items-center justify-between text-xs muted">
   <span>{(viewport.startUs/1e6).toFixed(2)}s</span>
   <span>红色为删除区间 · 拖动选择 · Ctrl+滚轮缩放</span>
   <span>{(viewport.endUs/1e6).toFixed(2)}s</span>
  </div>
 </div>
}
