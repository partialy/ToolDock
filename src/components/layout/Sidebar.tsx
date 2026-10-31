import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Search, ChevronDown, MoreHorizontal, Settings, Grid3X3, House, Plus, Blocks, Info, Zap } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {Workspace} from '@/store/useWorkspace'
import type {Category,Tool,ToolPage} from '@/types/models'

export function Sidebar({ws,active,onGo,onEditCat,onEditTool,onAdd,collapsed,setCollapsed}:{ws:Workspace;active:string;onGo:(value:string)=>void;onEditCat:(c:Category)=>void;onEditTool:(t:Tool)=>void;onAdd:()=>void;collapsed:boolean;setCollapsed:(v:boolean)=>void}){
 const [search,setSearch]=useState('')
 const [folded,setFolded]=useState<string[]>([])
 const cats=ws.categories.filter(c=>c.visible)
 const tools=ws.tools.filter(t=>t.visible&&ws.categories.some(c=>c.id===t.categoryId&&c.visible))
 const matches=(t:Tool,q:string)=>t.name.toLowerCase().includes(q)||t.target.toLowerCase().includes(q)
 const query=search.trim().toLowerCase()
 const filtered=cats.map(c=>({...c,items:tools.filter(t=>t.categoryId===c.id&&(!query||matches(t,query)||c.name.toLowerCase().includes(query)))})).filter(c=>!query||c.items.length||c.name.toLowerCase().includes(query))
 const toggle=(id:string)=>setFolded(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])
 return <motion.aside initial={false} animate={{width:collapsed?62:ws.settings.sidebarWidth}} transition={ws.settings.motion==='off'?{duration:0}:{type:'spring',stiffness:340,damping:37}} className="relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--panel)]">
  <div className="flex h-14 shrink-0 items-center justify-between px-3">
   {!collapsed&&<span className="flex items-center gap-2 text-sm font-semibold"><Blocks size={18} className="text-indigo-400"/> 工作区</span>}
   <Button variant="ghost" size="icon" aria-label={collapsed?'展开侧栏':'收起侧栏'} title={collapsed?'展开侧栏':'收起侧栏'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>}</Button>
  </div>
  {!collapsed&&<div className="px-3 pb-3"><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-[var(--muted)]"/><Input className="pl-9" placeholder="搜索分类或工具..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>}
  <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
   <nav aria-label="系统导航" className="space-y-1 pb-3">
    <button onClick={()=>onGo('home')} title="工作台" className={'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left hoverable '+(active==='home'?'bg-[var(--selected)] text-[var(--primary)]':'')}><House size={17}/>{!collapsed&&<span>工作台</span>}</button>
    <button onClick={()=>onGo('quick-launch')} title="快捷启动" className={'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left hoverable '+(active==='quick-launch'?'bg-[var(--selected)] text-[var(--primary)]':'')}><Zap size={17}/>{!collapsed&&<span>快捷启动</span>}</button>
   </nav>
   {!collapsed&&<div className="mb-2 flex items-center justify-between px-3 text-[11px] font-semibold tracking-widest muted">工具分类 <button aria-label="新增工具" onClick={onAdd} title="新增工具"><Plus size={15}/></button></div>}
   <nav aria-label="工具列表" className="space-y-1">
   {filtered.map(c=><div key={c.id}>
    <div className="group flex items-center rounded-lg hoverable">
     <button title={c.name} onClick={()=>{if(collapsed)setCollapsed(false);else toggle(c.id)}} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left">
      <Icon name={c.icon} size={17} className="shrink-0 text-[var(--muted)]"/>
      {!collapsed&&<><span className="truncate font-medium">{c.name}</span>{c.id==='default'&&ws.settings.showDefaultTag&&<span className="rounded bg-[var(--panel-alt)] px-1.5 py-0.5 text-[10px] muted">默认</span>}<ChevronDown size={13} className={'ml-auto shrink-0 transition-transform '+(folded.includes(c.id)&&!query?'-rotate-90':'')}/></>}
     </button>
     {!collapsed&&<button title="编辑分类" aria-label={'编辑'+c.name} onClick={()=>onEditCat(c)} className="mr-1 hidden rounded p-1.5 hover:bg-[var(--selected)] group-hover:block"><MoreHorizontal size={14}/></button>}
    </div>
    {!collapsed&&<AnimatePresence initial={false}>{(!folded.includes(c.id)||query)&&<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:ws.settings.motion==='off'?0:.18}} className="overflow-hidden">
      {c.items.map(t=><div key={t.id} className="group ml-3 flex items-center rounded-lg">
       <button onClick={()=>onGo('tool:'+t.id)} className={'flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 text-left text-[12px] hoverable '+(active==='tool:'+t.id?'bg-[var(--selected)] text-[var(--primary)]':'')}>
        <Icon name={t.icon} size={15} className="shrink-0"/><span className="truncate">{t.name}</span>
       </button>
       <button className="hidden rounded p-1 hover:bg-[var(--hover)] group-hover:block" title="编辑工具" aria-label={'编辑'+t.name} onClick={()=>onEditTool(t)}><MoreHorizontal size={14}/></button>
      </div>)}
      {!c.items.length&&<div className="ml-8 py-2 text-[11px] muted">暂无工具</div>}
     </motion.div>}</AnimatePresence>}
   </div>)}
   {!filtered.length&&!collapsed&&<p className="px-3 py-5 text-center text-xs muted">没有匹配的工具</p>}
   </nav>
  </div>
  <div className="shrink-0 border-t border-[var(--border)] p-2">
   {([['manager',Grid3X3,'工具管理'],['settings',Settings,'设置'],['about',Info,'关于']] as const).map(([k,I,label])=><button key={k} title={label} onClick={()=>onGo(k)} className={'mb-1 flex h-9 w-full items-center gap-3 rounded-lg px-3 hoverable '+(active===k?'bg-[var(--selected)] text-[var(--primary)]':'')}><I size={17}/>{!collapsed&&<span>{label}</span>}</button>)}
  </div>
 </motion.aside>
}
