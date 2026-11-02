import * as Menu from '@radix-ui/react-dropdown-menu'
import { ArrowLeft, ArrowRight, Plus, Minus, Square, X, Copy, Moon, Sun, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppLogo } from '@/components/ui/app-logo'
import type {Settings} from '@/types/models'
export function HeaderBar({back,forward,canBack,canForward,title,onAddCategory,onAddTool,settings,onTheme}:{back:()=>void;forward:()=>void;canBack:boolean;canForward:boolean;title:string;onAddCategory:()=>void;onAddTool:()=>void;settings:Settings;onTheme:()=>void}){
 return <header className="window-drag z-30 flex h-[48px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--panel)] px-1">
  <div className="window-nodrag flex items-center gap-1.5">
   <Button variant="ghost" size="icon" disabled={!canBack} onClick={back} aria-label="返回"><ArrowLeft size={18}/></Button>
   <Button variant="ghost" size="icon" disabled={!canForward} onClick={forward} aria-label="前进"><ArrowRight size={18}/></Button>
   <Menu.Root>
    <Menu.Trigger asChild><Button variant="ghost" size="icon" title="添加分类或工具" aria-label="添加"><Plus size={19}/></Button></Menu.Trigger>
    <Menu.Portal><Menu.Content sideOffset={9} align="start" className="z-50 min-w-48 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-xl">
      <Menu.Item onSelect={onAddTool} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-[var(--hover)] focus:bg-[var(--hover)]"><Plus size={15}/> 新增网页工具</Menu.Item>
      <Menu.Item onSelect={onAddCategory} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 outline-none hover:bg-[var(--hover)] focus:bg-[var(--hover)]"><Plus size={15}/> 新增分类</Menu.Item>
    </Menu.Content></Menu.Portal>
   </Menu.Root>
  </div>
  <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 flex max-w-[40%] items-center gap-2 truncate text-[13px] font-medium"><AppLogo size={24}/><span className="text-[var(--muted)]">ToolDock</span><span className="text-[var(--muted)]">/</span><span className="truncate">{title}</span></div>
  <div className="window-nodrag flex h-full items-center gap-1">
   <Button variant="ghost" size="icon" aria-label="切换主题" title="切换深浅主题" onClick={onTheme}>{settings.theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</Button>
   <span className="mx-2 h-4 w-px bg-[var(--border)]"/>
   <button className="flex h-9 w-10 items-center justify-center rounded-lg hover:bg-[var(--hover)]" aria-label="最小化" onClick={()=>void window.toolDock.window.minimize()}><Minus size={16}/></button>
   <button className="flex h-9 w-10 items-center justify-center rounded-lg hover:bg-[var(--hover)]" aria-label="最大化或还原" onClick={()=>void window.toolDock.window.toggleMaximize()}><Square size={13}/></button>
   <button className="flex h-9 w-10 items-center justify-center rounded-lg hover:bg-red-600 hover:text-white" aria-label="关闭" onClick={()=>void window.toolDock.window.close()}><X size={18}/></button>
  </div>
 </header>
}
