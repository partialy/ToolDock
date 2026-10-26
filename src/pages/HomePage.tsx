import {useMemo,useState} from 'react'
import {ArrowUpRight,Blocks,Search,Plus} from 'lucide-react'
import {Icon} from '@/components/ui/icon'
import {Input} from '@/components/ui/input'
import type {Workspace} from '@/store/useWorkspace'
export function HomePage({ws,onGo,onAdd}:{ws:Workspace;onGo:(v:string)=>void;onAdd:()=>void}){
 const [query,setQuery]=useState('')
 const categories=useMemo(()=>ws.categories.filter(c=>c.visible).sort((a,b)=>a.sortOrder-b.sortOrder),[ws.categories])
 const tools=useMemo(()=>ws.tools.filter(t=>t.visible&&categories.some(c=>c.id===t.categoryId)).filter(t=>!query||t.name.toLowerCase().includes(query.trim().toLowerCase())),[ws.tools,categories,query])
 const featured=tools.filter(t=>t.isBuiltin).slice(0,4)
 const tile=(t:(typeof tools)[number])=><button key={t.id} onClick={()=>onGo('tool:'+t.id)} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-left transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--hover)]">
  <span className="rounded-lg bg-[var(--panel-alt)] p-2 text-indigo-400"><Icon name={t.icon} size={19}/></span>
  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}</span><ArrowUpRight size={15} className="shrink-0 muted"/>
 </button>
 return <div className="@container mx-auto max-w-[1350px] space-y-7 p-6">
  <header className="flex flex-wrap items-center gap-4"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15"><Blocks size={24} className="text-indigo-400"/></div><div className="min-w-0 flex-1"><h1 className="text-2xl font-semibold">ToolDock 工作台</h1><p className="mt-1 text-xs muted">集中使用你的开发和图片工具</p></div>
   <div className="relative w-full max-w-72"><Search size={16} className="absolute left-3 top-2.5 muted"/><Input aria-label="搜索工具" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索工具..." className="pl-10"/></div>
  </header>
  {!!featured.length&&<section className="space-y-3"><h2 className="text-sm font-semibold">快捷入口</h2><div className="grid gap-3 @min-[650px]:grid-cols-2 @min-[1050px]:grid-cols-4">{featured.map(tile)}</div></section>}
  {categories.map(c=>{const list=tools.filter(t=>t.categoryId===c.id).sort((a,b)=>a.sortOrder-b.sortOrder);return list.length?<section key={c.id} className="space-y-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name={c.icon} size={17}/>{c.name}<span className="text-xs font-normal muted">{list.length}</span></h2><div className="grid gap-3 @min-[650px]:grid-cols-2 @min-[1050px]:grid-cols-3">{list.map(tile)}</div></section>:null})}
  {!tools.length&&<p className="py-16 text-center text-sm muted">没有匹配的工具</p>}
  <button onClick={onAdd} className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border)] p-3 text-xs muted hover:bg-[var(--hover)]"><Plus size={15}/> 添加网页工具</button>
 </div>
}
