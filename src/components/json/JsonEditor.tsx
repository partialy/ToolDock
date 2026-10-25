import {useEffect,useRef} from 'react'
import {EditorView,basicSetup} from 'codemirror'
import {EditorState} from '@codemirror/state'
import {json} from '@codemirror/lang-json'
import {setDiagnostics,type Diagnostic} from '@codemirror/lint'
import type {JsonDiagnostic} from '@/lib/json/parse'

type Props={value:string;onChange?:(text:string)=>void;readOnly?:boolean;diagnostics?:JsonDiagnostic[];ariaLabel:string;className?:string}
export function JsonEditor({value,onChange,readOnly=false,diagnostics=[],ariaLabel,className=''}:Props){
 const mount=useRef<HTMLDivElement>(null)
 const viewRef=useRef<EditorView|null>(null)
 const callback=useRef(onChange)
 callback.current=onChange
 useEffect(()=>{
  if(!mount.current)return
  const theme=EditorView.theme({
   '&':{height:'100%',fontSize:'12px',background:'var(--panel-alt)',color:'var(--foreground)'},
   '.cm-content':{fontFamily:'ui-monospace,SFMono-Regular,Consolas,monospace',padding:'12px 0'},
   '.cm-scroller':{overflow:'auto'},
   '.cm-gutters':{background:'var(--panel-alt)',color:'var(--muted)',borderRight:'1px solid var(--border)'},
   '.cm-activeLine':{background:'var(--hover)'},
   '.cm-activeLineGutter':{background:'var(--hover)'},
   '.cm-cursor':{borderLeftColor:'var(--primary)'},
   '.cm-selectionBackground':{background:'var(--selected)!important'},
   '&.cm-focused':{outline:'none'},
  })
  const state=EditorState.create({doc:value,extensions:[
   basicSetup,json(),theme,EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly),
   EditorView.updateListener.of(update=>{if(update.docChanged)callback.current?.(update.state.doc.toString())}),
   EditorView.contentAttributes.of({'aria-label':ariaLabel}),
  ]})
  const view=new EditorView({state,parent:mount.current})
  viewRef.current=view
  return()=>{view.destroy();viewRef.current=null}
 // Component is keyed by readOnly in the parent; text changes are applied to an existing editor to preserve Undo.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[readOnly,ariaLabel])
 useEffect(()=>{
  const view=viewRef.current
  if(view&&view.state.doc.toString()!==value)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:value}})
 },[value])
 useEffect(()=>{
  const view=viewRef.current
  if(!view)return
  const size=view.state.doc.length
  const items:Diagnostic[]=diagnostics.map(item=>({
    from:Math.min(size,item.from),to:Math.max(Math.min(size,item.from),Math.min(size,item.to)),
    severity:item.severity,message:item.message
  }))
  view.dispatch(setDiagnostics(view.state,items))
 },[diagnostics,value])
 return <div ref={mount} className={'min-h-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] focus-within:border-[var(--primary)] '+className}/>
}
