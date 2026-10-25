import { useCallback, useEffect, useState } from 'react'
import type {Category,Tool,Settings} from '@/types/models'
const initialSettings:Settings={theme:'dark',motion:'normal',showDefaultTag:true,allowHttp:false,sidebarWidth:252}
export function useWorkspace(){
 const [categories,setCategories]=useState<Category[]>([])
 const [tools,setTools]=useState<Tool[]>([])
 const [settings,setSettings]=useState<Settings>(initialSettings)
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState('')
 const refresh=useCallback(async()=>{
  const [cats,items,opts]=await Promise.all([window.toolDock.categories.list(),window.toolDock.tools.list(),window.toolDock.settings.get()])
  setCategories(cats);setTools(items);setSettings(opts)
 },[])
 useEffect(()=>{refresh().catch(e=>setError(String(e))).finally(()=>setBusy(false))},[refresh])
 const execute=async(fn:()=>Promise<unknown>)=>{setError('');try{await fn();await refresh()}catch(e){setError(e instanceof Error?e.message:String(e));throw e}}
 const setPreference=async<K extends keyof Settings>(key:K,value:Settings[K])=>{await execute(()=>window.toolDock.settings.set(key,value))}
 return {categories,tools,settings,busy,error,setError,refresh,execute,setPreference}
}
export type Workspace=ReturnType<typeof useWorkspace>
