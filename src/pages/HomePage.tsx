import { motion } from 'motion/react'
import { ArrowUpRight, Blocks, Globe, KeyRound, Plus, Sparkles } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import type {Workspace} from '@/store/useWorkspace'
export function HomePage({ws,onGo,onAdd}:{ws:Workspace;onGo:(v:string)=>void;onAdd:()=>void}){
 const recent=ws.tools.slice(0,9)
 return <div className="mx-auto max-w-5xl space-y-8 p-8">
  <div className="pt-8"><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400"><Blocks size={24}/></div><h1 className="text-3xl font-semibold tracking-tight">你的工具工作台</h1><p className="mt-3 text-sm muted">把常用工具放在一起，轻松切换，让每件小事都更简单。</p></div>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
   <button onClick={()=>onGo('tool:builtin-key-generator')} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-400/50 hover:shadow-lg"><KeyRound className="mb-4 text-indigo-400"/><div className="font-semibold">密钥生成器</div><div className="mt-1 text-xs muted">RSA / SSH / AES / 安全随机字符串</div><ArrowUpRight className="mt-4 text-[var(--muted)]" size={16}/></button>
   <button onClick={onAdd} className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] p-5 text-left transition-all hover:-translate-y-0.5 hover:border-indigo-400/50"><Plus className="mb-4 text-indigo-400"/><div className="font-semibold">添加网页工具</div><div className="mt-1 text-xs muted">把常访问的网站固定到侧栏</div><ArrowUpRight className="mt-4 text-[var(--muted)]" size={16}/></button>
  </div>
  <section><h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Sparkles size={16}/> 全部工具 <span className="muted">({ws.tools.length})</span></h2>
   <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{recent.map((t,i)=><motion.button key={t.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:ws.settings.motion==='off'?0:i*.03}} onClick={()=>onGo('tool:'+t.id)} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-left hover:bg-[var(--hover)]"><div className="rounded-lg bg-[var(--panel-alt)] p-2"><Icon name={t.icon}/></div><span className="min-w-0 flex-1 truncate font-medium">{t.name}</span><ArrowUpRight size={14} className="muted"/></motion.button>)}</div>
  </section>
 </div>
}
