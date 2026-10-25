import { useCallback,useEffect,useRef,useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, RefreshCw, Globe, Blocks } from 'lucide-react'
import { HeaderBar } from '@/components/layout/HeaderBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { EditorDialog } from '@/components/forms/EditorDialog'
import { Button } from '@/components/ui/button'
import { useWorkspace } from '@/store/useWorkspace'
import { HomePage } from '@/pages/HomePage'
import { ManagerPage } from '@/pages/ManagerPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { KeyGeneratorPage } from '@/pages/KeyGeneratorPage'
import type {Category,Tool} from '@/types/models'

type Editor=({kind:'category';item?:Category}|{kind:'tool';item?:Tool})|null
function WebTool({toolId}:{toolId:string}){
 const ref=useRef<HTMLDivElement>(null)
 const [status,setStatus]=useState('loading'),[message,setMessage]=useState('')
 useEffect(()=>{
  const off=window.toolDock.views.onStatus(e=>{setStatus(e.status);setMessage(e.message||'')})
  window.toolDock.views.show().then(()=>window.toolDock.views.open(toolId)).catch(e=>{setStatus('error');setMessage(e instanceof Error?e.message:String(e))})
  return()=>{off();void window.toolDock.views.hide()}
 },[toolId])
 useEffect(()=>{
  const node=ref.current;if(!node)return
  const update=()=>{const b=node.getBoundingClientRect();void window.toolDock.views.bounds({x:b.left,y:b.top,width:b.width,height:b.height})}
  const observer=new ResizeObserver(update);observer.observe(node);update()
  return()=>observer.disconnect()
 },[toolId])
 useEffect(()=>{if(status==='error'||status==='crashed')void window.toolDock.views.hide()},[status])
 const retry=()=>{setStatus('loading');void window.toolDock.views.show().then(()=>window.toolDock.views.reload())}
 return <div ref={ref} className="relative h-full w-full">
  {(status==='error'||status==='crashed')&&<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center"><AlertTriangle size={34} className="text-amber-400"/><div className="text-base font-semibold">网页工具暂时不可用</div><p className="max-w-lg text-xs muted">{message||'网络错误或页面渲染进程已停止'}</p><Button onClick={retry}><RefreshCw size={15}/> 重新加载</Button></div>}
  {status==='loading'&&<div className="absolute left-4 top-4 rounded-lg bg-[var(--panel-alt)] px-3 py-2 text-xs muted">正在加载网页…</div>}
 </div>
}
export default function App(){
 const ws=useWorkspace()
 const reducedSystem=useReducedMotion()
 const [history,setHistory]=useState(['home'])
 const [position,setPosition]=useState(0)
 const [collapsed,setCollapsed]=useState(false)
 const [editor,setEditor]=useState<Editor>(null)
 const active=history[position]||'home'
 const tool=active.startsWith('tool:')?ws.tools.find(t=>t.id===active.slice(5)):undefined
 const title=tool?.name||({home:'工作台',manager:'工具管理',settings:'设置',about:'关于'} as Record<string,string>)[active]||'ToolDock'
 const navigate=useCallback((destination:string)=>{
  if(destination===active)return
  setHistory(prev=>[...prev.slice(0,position+1),destination].slice(-60))
  setPosition(Math.min(position+1,59))
 },[active,position])
 const openEditor=(e:Editor)=>{setEditor(e);void window.toolDock.views.hide()}
 const closeEditor=()=>{setEditor(null);if(tool?.type==='link')void window.toolDock.views.show()}
 const setSidebarWidth=(x:number)=>{const width=Math.max(200,Math.min(440,x));void ws.setPreference('sidebarWidth',width)}
 const drag=useRef<{startX:number;startWidth:number}|null>(null)
 const motionOff=ws.settings.motion!=='normal'||Boolean(reducedSystem)
 useEffect(()=>{document.documentElement.classList.toggle('dark',ws.settings.theme==='dark')},[ws.settings.theme])
 useEffect(()=>{if(!ws.busy&&tool?.type!=='link')void window.toolDock.views.hide()},[ws.busy,tool?.type,active])
 useEffect(()=>{if(editor)void window.toolDock.views.hide()},[editor])
 const body=()=>{
  if(active==='home')return <HomePage ws={ws} onGo={navigate} onAdd={()=>openEditor({kind:'tool'})}/>
  if(active==='manager')return <ManagerPage ws={ws} onEdit={openEditor}/>
  if(active==='settings')return <SettingsPage ws={ws}/>
  if(active==='about')return <div className="mx-auto max-w-3xl p-12"><div className="mb-4 flex items-center gap-3"><Blocks size={32} className="text-indigo-400"/><h1 className="text-2xl font-semibold">ToolDock</h1></div><p className="mb-5 text-sm muted">桌面工具聚合平台 · v0.1.0</p><p className="text-sm leading-8 muted">React + Electron + shadcn/ui + Tailwind CSS + Motion + SQLite。将常用网页与开发工具集中在一个独立工作区。</p></div>
  if(tool?.type==='link')return <WebTool key={tool.id} toolId={tool.id}/>
  if(tool?.type==='internal'&&tool.target==='key-generator')return <KeyGeneratorPage key={tool.id}/>
  return <div className="p-10 muted">页面不存在或工具已删除。请从侧栏选择工具。</div>
 }
 return <MotionConfig reducedMotion={motionOff?'always':'never'}>
  <div className={'flex h-screen w-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] '+(ws.settings.theme==='dark'?'dark':'')}>
   <HeaderBar back={()=>setPosition(p=>Math.max(0,p-1))} forward={()=>setPosition(p=>Math.min(history.length-1,p+1))} canBack={position>0} canForward={position<history.length-1} title={title} onAddCategory={()=>openEditor({kind:'category'})} onAddTool={()=>openEditor({kind:'tool'})} settings={ws.settings} onTheme={()=>void ws.setPreference('theme',ws.settings.theme==='dark'?'light':'dark')}/>
   <div className="relative flex min-h-0 flex-1">
    <Sidebar ws={ws} active={active} onGo={navigate} onEditCat={c=>openEditor({kind:'category',item:c})} onEditTool={t=>openEditor({kind:'tool',item:t})} onAdd={()=>openEditor({kind:'tool'})} collapsed={collapsed} setCollapsed={setCollapsed}/>
    {!collapsed&&<div className="absolute top-0 z-20 h-full w-1 cursor-col-resize hover:bg-indigo-500/40" style={{left:ws.settings.sidebarWidth-2}} onPointerDown={e=>{drag.current={startX:e.clientX,startWidth:ws.settings.sidebarWidth};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerUp={e=>{if(drag.current){void setSidebarWidth(drag.current.startWidth+e.clientX-drag.current.startX);drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId)}}} onPointerMove={e=>{if(drag.current){const w=Math.max(200,Math.min(440,drag.current.startWidth+e.clientX-drag.current.startX));e.currentTarget.style.left=(w-2)+'px'}}}/>}
    <main className="relative min-w-0 flex-1 overflow-auto" aria-label="工具内容">
     {ws.busy?<div className="p-8 muted">正在打开 ToolDock…</div>:<AnimatePresence mode="wait">
      <motion.div key={active} initial={{opacity:0,y:motionOff?0:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:motionOff?0:-3}} transition={{duration:motionOff?0:.16}} className="h-full min-h-0 w-full">{body()}</motion.div>
     </AnimatePresence>}
    </main>
   </div>
   {ws.error&&<div role="alert" className="absolute bottom-4 right-4 z-50 max-w-lg rounded-xl border border-red-500/40 bg-[var(--panel)] p-4 text-sm text-red-400 shadow-xl"><button aria-label="关闭错误" onClick={()=>ws.setError('')} className="float-right ml-4">×</button>{ws.error}</div>}
   <EditorDialog edit={editor} onClose={closeEditor} ws={ws}/>
  </div>
 </MotionConfig>
}
