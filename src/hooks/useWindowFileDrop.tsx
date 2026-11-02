import {useEffect,useRef,useState} from 'react'

/** Accept OS files on the active tool page, never intercept the app's internal DnD sorting. */
export function useWindowFileDrop(onFiles:(files:File[])=>void|Promise<void>,enabled=true){
 const [over,setOver]=useState(false)
 const latest=useRef(onFiles);latest.current=onFiles
 useEffect(()=>{
  if(!enabled)return
  let depth=0
  const isFiles=(e:DragEvent)=>Array.from(e.dataTransfer?.types||[]).includes('Files')
  const modalOpen=()=>Boolean(document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="dialog"][aria-modal="true"]'))
  const enter=(e:DragEvent)=>{if(!isFiles(e)||modalOpen())return;e.preventDefault();depth++;setOver(true)}
  const leave=(e:DragEvent)=>{if(!isFiles(e))return;e.preventDefault();depth=Math.max(0,depth-1);if(!depth)setOver(false)}
  const move=(e:DragEvent)=>{if(isFiles(e)&&!modalOpen()){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy'}}
  const drop=(e:DragEvent)=>{if(!isFiles(e))return;e.preventDefault();depth=0;setOver(false);if(modalOpen())return;const files=Array.from(e.dataTransfer?.files||[]);if(files.length)void latest.current(files)}
  const reset=()=>{depth=0;setOver(false)}
  window.addEventListener('dragenter',enter);window.addEventListener('dragleave',leave)
  window.addEventListener('dragover',move);window.addEventListener('drop',drop);window.addEventListener('blur',reset)
  return()=>{window.removeEventListener('dragenter',enter);window.removeEventListener('dragleave',leave);window.removeEventListener('dragover',move);window.removeEventListener('drop',drop);window.removeEventListener('blur',reset)}
 },[enabled])
 return over
}
export function DropOverlay({visible,label='释放以添加文件'}:{visible:boolean;label?:string}){
 if(!visible)return null
 return <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-indigo-500/10 backdrop-blur-[2px]">
  <div className="rounded-2xl border-2 border-dashed border-indigo-400 bg-[var(--panel)] px-12 py-12 text-center text-base font-semibold text-indigo-400 shadow-2xl">{label}</div>
 </div>
}
