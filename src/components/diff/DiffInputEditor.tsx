import {useEffect,useRef} from 'react'
import {EditorView,basicSetup} from 'codemirror'
import {EditorState} from '@codemirror/state'
import {json} from '@codemirror/lang-json'
import type {DiffMode} from '@/lib/diff/compare'

interface Props{value:string;onChange:(value:string)=>void;mode:DiffMode;label:string}
export function DiffInputEditor({value,onChange,mode,label}:Props){
 const mount=useRef<HTMLDivElement>(null)
 const editor=useRef<EditorView|null>(null)
 const change=useRef(onChange)
 change.current=onChange
 useEffect(()=>{
  if(!mount.current)return
  const theme=EditorView.theme({
   '&':{height:'100%',fontSize:'12px',background:'var(--panel-alt)',color:'var(--foreground)'},
   '.cm-content':{fontFamily:'ui-monospace,SFMono-Regular,Consolas,monospace',padding:'12px 0'},
   '.cm-scroller':{overflow:'auto'},
   '.cm-gutters':{background:'var(--panel-alt)',color:'var(--muted)',borderRight:'1px solid var(--border)'},
   '.cm-activeLine,.cm-activeLineGutter':{background:'var(--hover)'},
   '.cm-cursor':{borderLeftColor:'var(--primary)'},
   '.cm-selectionBackground':{background:'var(--selected)!important'},
   '&.cm-focused':{outline:'none'}
  })
  const state=EditorState.create({doc:value,extensions:[
   basicSetup,...(mode==='json'?[json()]:[]),theme,
   EditorView.updateListener.of(update=>{if(update.docChanged)change.current(update.state.doc.toString())}),
   EditorView.contentAttributes.of({'aria-label':label})
  ]})
  const view=new EditorView({state,parent:mount.current})
  editor.current=view
  return()=>{editor.current=null;view.destroy()}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[mode,label])
 useEffect(()=>{
  const view=editor.current
  if(view&&view.state.doc.toString()!==value)view.dispatch({changes:{from:0,to:view.state.doc.length,insert:value}})
 },[value,mode])
 return <div ref={mount} className="h-full min-h-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] focus-within:border-[var(--primary)]"/>
}
