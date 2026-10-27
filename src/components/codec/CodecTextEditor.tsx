import {useEffect,useRef} from 'react'
import {EditorView,basicSetup} from 'codemirror'
import {EditorState} from '@codemirror/state'
type Props={value:string;onChange?:(s:string)=>void;readOnly?:boolean;label:string;className?:string;maxBytes?:number;onReject?:()=>void}
export function CodecTextEditor({value,onChange,readOnly=false,label,className='h-64',maxBytes,onReject}:Props){
 const mount=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),cb=useRef(onChange),reject=useRef(onReject)
 cb.current=onChange;reject.current=onReject
 useEffect(()=>{
  if(!mount.current)return
  const theme=EditorView.theme({'&':{height:'100%',fontSize:'12px',background:'var(--panel-alt)',color:'var(--foreground)'},'.cm-content':{fontFamily:'Consolas,ui-monospace,monospace',padding:'12px 0',overflowWrap:'anywhere'},'.cm-scroller':{overflow:'auto'},'.cm-gutters':{background:'var(--panel-alt)',color:'var(--muted)',borderRight:'1px solid var(--border)'},'.cm-activeLine':{background:'var(--hover)'},'&.cm-focused':{outline:'none'}})
  const extensions=[basicSetup,theme,EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly),EditorView.contentAttributes.of({'aria-label':label}),
   EditorState.transactionFilter.of(tr=>{
    if(!readOnly&&maxBytes!==undefined&&tr.docChanged&&new TextEncoder().encode(tr.newDoc.toString()).length>maxBytes){reject.current?.();return []}
    return tr
   }),
   EditorView.updateListener.of(u=>{if(u.docChanged)cb.current?.(u.state.doc.toString())})]
  const editor=new EditorView({state:EditorState.create({doc:value,extensions}),parent:mount.current})
  view.current=editor
  return()=>{view.current=null;editor.destroy()}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[label,readOnly,maxBytes])
 useEffect(()=>{const ed=view.current;if(ed&&ed.state.doc.toString()!==value)ed.dispatch({changes:{from:0,to:ed.state.doc.length,insert:value}})},[value])
 return <div ref={mount} className={'min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] focus-within:border-[var(--primary)] '+className}/>
}
