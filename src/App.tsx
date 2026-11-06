import { useCallback,useEffect,useRef,useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, RefreshCw, Globe } from 'lucide-react'
import { version } from '../package.json'
import { AppLogo } from '@/components/ui/app-logo'
import { MotionPreferenceContext } from '@/components/ui/motion-preference'
import { HeaderBar } from '@/components/layout/HeaderBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { EditorDialog } from '@/components/forms/EditorDialog'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { DialogProvider } from '@/components/ui/dialog-provider'
import {ToolPageIconProvider} from '@/components/ui/tool-page-icon'
import { useWorkspace } from '@/store/useWorkspace'
import { HomePage } from '@/pages/HomePage'
import { ManagerPage } from '@/pages/ManagerPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { QuickLaunchPage } from '@/pages/QuickLaunchPage'
import { KeyGeneratorPage } from '@/pages/KeyGeneratorPage'
import { JsonToolPage } from '@/pages/JsonToolPage'
import { TextDiffPage } from '@/pages/TextDiffPage'
import {CodecToolPage} from '@/pages/CodecToolPage'
import {CommandToolPage} from '@/pages/CommandToolPage'
import { ImageProcessorPage } from '@/pages/ImageProcessorPage'
import { LogoIconGeneratorPage } from '@/pages/LogoIconGeneratorPage'
import { ImageEncodingPage } from '@/pages/ImageEncodingPage'
import { QrCodeToolPage } from '@/pages/QrCodeToolPage'
import { FileTransferPage } from '@/pages/FileTransferPage'
import { VideoProcessingPage } from '@/pages/VideoProcessingPage'
import {NotificationProvider} from '@/components/notifications/NotificationProvider'
import { TimeConverterPage } from '@/pages/TimeConverterPage'
import { UuidGeneratorPage } from '@/pages/UuidGeneratorPage'
import { builtinByTarget } from '@/shared/builtinToolRegistry'
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
 const [transferRunning,setTransferRunning]=useState(false)
 useEffect(()=>{let live=true;void window.toolDock.transfer.status().then(s=>{if(live)setTransferRunning(s.running)}).catch(()=>{});const off=window.toolDock.transfer.onChange(s=>{if(live)setTransferRunning(s.running)});return()=>{live=false;off()}},[])
 const [editor,setEditor]=useState<Editor>(null)
 const [unsaved,setUnsaved]=useState(false)
 const [pending,setPending]=useState<{kind:'push';destination:string}|{kind:'move';index:number}|null>(null)
 useEffect(()=>{const listener=(e:Event)=>setUnsaved(Boolean((e as CustomEvent<boolean>).detail));window.addEventListener('tooldock:unsaved',listener);return()=>window.removeEventListener('tooldock:unsaved',listener)},[])
 const active=history[position]||'home'
 const tool=active.startsWith('tool:')?ws.tools.find(t=>t.id===active.slice(5)):undefined
 const title=tool?.name||({home:'工作台','quick-launch':'快捷启动',manager:'工具管理',settings:'设置',about:'关于'} as Record<string,string>)[active]||'ToolDock'
 const commitNavigation=useCallback((destination:string)=>{
  if(destination===active)return
  setHistory(prev=>[...prev.slice(0,position+1),destination].slice(-60))
  setPosition(Math.min(position+1,59));setUnsaved(false)
 },[active,position])
 const navigate=useCallback((destination:string)=>{if(destination===active)return;if(unsaved)setPending({kind:'push',destination});else commitNavigation(destination)},[active,unsaved,commitNavigation])
 const stepHistory=(index:number)=>{if(index<0||index>=history.length||index===position)return;if(unsaved)setPending({kind:'move',index});else setPosition(index)}
 const confirmNavigation=()=>{if(!pending)return;if(pending.kind==='push')commitNavigation(pending.destination);else{setPosition(pending.index);setUnsaved(false)}setPending(null)}
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
  if(active==='quick-launch')return <QuickLaunchPage trigger={ws.settings.quickLaunchTrigger}/>
  if(active==='about')return <div className="mx-auto max-w-3xl p-12"><div className="mb-4 flex items-center gap-3"><AppLogo size={48}/><h1 className="text-2xl font-semibold">ToolDock</h1></div><p className="mb-5 text-sm muted">桌面工具聚合平台 · v{version}</p><p className="text-sm leading-8 muted">将常用网页、开发工具与快捷启动集中在一个独立工作区。</p></div>
  if(tool?.type==='link')return <WebTool key={tool.id} toolId={tool.id}/>
  if(tool?.type==='internal'&&builtinByTarget(tool.target)){
   const pages:Record<string,React.ReactNode>={'key-generator':<KeyGeneratorPage key={tool.id}/>,'json-tool':<JsonToolPage key={tool.id}/>,'text-diff':<TextDiffPage key={tool.id}/>,'codec-tool':<CodecToolPage key={tool.id}/>,'command-tool':<CommandToolPage key={tool.id}/>,'image-processor':<ImageProcessorPage key={tool.id}/>,'logo-icon-generator':<LogoIconGeneratorPage key={tool.id}/>,'image-encoding':<ImageEncodingPage key={tool.id}/>,'qr-code-tool':<QrCodeToolPage key={tool.id}/>,'file-transfer':<FileTransferPage key={tool.id}/>,'time-converter':<TimeConverterPage key={tool.id}/>,'uuid-generator':<UuidGeneratorPage key={tool.id}/>}
   if(tool.target==='video-processing')return <VideoProcessingPage key={tool.id}/>
   return pages[tool.target]
  }
  return <div className="p-10 muted">页面不存在或工具已删除。请从侧栏选择工具。</div>
 }
 return <MotionPreferenceContext.Provider value={ws.settings.motion}><MotionConfig reducedMotion={motionOff?'always':'never'}><DialogProvider><NotificationProvider position={ws.settings.notificationPosition} previewPositionChanges={!ws.busy} onOpenTransfer={()=>{navigate('tool:builtin-file-transfer');setTimeout(()=>window.dispatchEvent(new Event('tooldock:show-incoming')),320)}}>
  <div className={'flex h-screen w-screen flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] '+(ws.settings.theme==='dark'?'dark':'')}>
   <HeaderBar back={()=>stepHistory(position-1)} forward={()=>stepHistory(position+1)} canBack={position>0} canForward={position<history.length-1} title={title} onAddCategory={()=>openEditor({kind:'category'})} onAddTool={()=>openEditor({kind:'tool'})} settings={ws.settings} onTheme={()=>void ws.setPreference('theme',ws.settings.theme==='dark'?'light':'dark')} transferRunning={transferRunning} onOpenTransfer={()=>navigate('tool:builtin-file-transfer')}/>
   <div className="relative flex min-h-0 flex-1">
    <Sidebar ws={ws} active={active} onGo={navigate} onEditCat={c=>openEditor({kind:'category',item:c})} onEditTool={t=>openEditor({kind:'tool',item:t})} onAdd={()=>openEditor({kind:'tool'})} collapsed={collapsed} setCollapsed={setCollapsed}/>
    {!collapsed&&<div className="absolute top-0 z-20 h-full w-1 cursor-col-resize hover:bg-indigo-500/40" style={{left:ws.settings.sidebarWidth-2}} onPointerDown={e=>{drag.current={startX:e.clientX,startWidth:ws.settings.sidebarWidth};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerUp={e=>{if(drag.current){void setSidebarWidth(drag.current.startWidth+e.clientX-drag.current.startX);drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId)}}} onPointerMove={e=>{if(drag.current){const w=Math.max(200,Math.min(440,drag.current.startWidth+e.clientX-drag.current.startX));e.currentTarget.style.left=(w-2)+'px'}}}/>}
    <main className="relative min-w-0 flex-1 overflow-auto" aria-label="工具内容">
     {ws.busy?<div className="p-8 muted">正在打开 ToolDock…</div>:<AnimatePresence mode="wait">
      <motion.div key={active} initial={{opacity:0,y:motionOff?0:4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:motionOff?0:-3}} transition={{duration:motionOff?0:.16}} className="h-full min-h-0 w-full"><ToolPageIconProvider name={tool?.icon}>{body()}</ToolPageIconProvider></motion.div>
     </AnimatePresence>}
    </main>
   </div>
   {ws.error&&<div role="alert" className="absolute bottom-4 right-4 z-50 max-w-lg rounded-xl border border-red-500/40 bg-[var(--panel)] p-4 text-sm text-red-400 shadow-xl"><button aria-label="关闭错误" onClick={()=>ws.setError('')} className="float-right ml-4">×</button>{ws.error}</div>}
   <EditorDialog edit={editor} onClose={closeEditor} ws={ws}/>
   <Modal open={Boolean(pending)} onOpenChange={v=>{if(!v)setPending(null)}} title="离开当前工具？" footer={<><Button onClick={()=>setPending(null)}>继续编辑</Button><Button variant="primary" onClick={confirmNavigation}>确认离开</Button></>}><p className="text-sm muted">当前工具存在尚未保存的配置、输入内容或未导出的处理结果。离开后可能丢失临时工作区，是否继续？</p></Modal>
  </div>
 </NotificationProvider></DialogProvider></MotionConfig></MotionPreferenceContext.Provider>
}
