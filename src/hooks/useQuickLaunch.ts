import {msg} from '@/components/ui/message'
import {useCallback,useEffect,useRef,useState} from 'react'
import type {QuickLaunchSnapshot} from '@/shared/quickLaunchModels'

const empty:QuickLaunchSnapshot={apps:[],groups:[],tasks:[],environment:{windowsPowerShell:null,pwsh:null,cmd:null}}
/** 列表只保留任务元数据；输出由打开的详情抽屉按需读取。 */
export function useQuickLaunch(){
 const [snapshot,setSnapshot]=useState(empty),[loading,setLoading]=useState(true),[error,setError]=useState(''),[pending,setPending]=useState<string[]>([])
 const mounted=useRef(false),loadingRef=useRef(false),tasksReading=useRef(false),snapshotEpoch=useRef(0),locks=useRef(new Set<string>())
 const refresh=useCallback(async()=>{
  if(loadingRef.current)return
  loadingRef.current=true;snapshotEpoch.current++
  try{const value=await window.toolDock.quickLaunch.list();if(mounted.current)setSnapshot({...value,tasks:value.tasks.map(t=>({...t,output:''}))})}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e))}
  finally{loadingRef.current=false;if(mounted.current)setLoading(false)}
 },[])
 const refreshTasks=useCallback(async()=>{
  if(loadingRef.current||tasksReading.current||!mounted.current)return
  tasksReading.current=true;const epoch=snapshotEpoch.current
  try{
   const tasks=await window.toolDock.quickLaunch.tasks()
   // 完整刷新可能在任务请求期间开始；旧任务响应不能覆盖更新后的快照。
   if(mounted.current&&epoch===snapshotEpoch.current&&!loadingRef.current)setSnapshot(previous=>({...previous,tasks:tasks.map(task=>({...task,output:''}))}))
  }catch(e){if(mounted.current)setError(previous=>previous||'读取快捷启动任务状态失败：'+(e instanceof Error?e.message:String(e)))}
  finally{tasksReading.current=false}
 },[])
 useEffect(()=>{
  mounted.current=true;void refresh();let timer:ReturnType<typeof setTimeout>|undefined
  const off=window.toolDock.quickLaunch.onChange(()=>{if(!timer)timer=setTimeout(()=>{timer=undefined;void refreshTasks()},250)})
  const polling=setInterval(()=>void refreshTasks(),1000)
  return()=>{mounted.current=false;off();clearTimeout(timer);clearInterval(polling)}
 },[refresh,refreshTasks])
 const action=async<T,>(key:string,fn:()=>Promise<T>):Promise<T|undefined>=>{
  if(locks.current.has(key))return
  locks.current.add(key);setPending([...locks.current]);setError('')
  try{const value=await fn();await refresh();return value}
  catch(e){if(mounted.current)msg.error(e);return undefined}
  finally{locks.current.delete(key);if(mounted.current)setPending([...locks.current])}
 }
 return {...snapshot,loading,error,setError,pending,refresh,action,api:window.toolDock.quickLaunch}
}
