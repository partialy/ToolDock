import {useCallback,useEffect,useRef,useState} from 'react'
import type {DashboardSnapshot} from '@/shared/dashboardModels'

/** 只在工作台挂载期间订阅状态，合并频繁事件，低频轮询覆盖偶发丢失通知。 */
export function useDashboard(){
 const [snapshot,setSnapshot]=useState<DashboardSnapshot|null>(null)
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(true)
 const mounted=useRef(false),reading=useRef(false),pending=useRef(false)
 const refresh=useCallback(async()=>{
  if(reading.current){pending.current=true;return}
  reading.current=true
  try{
   const value=await window.toolDock.dashboard.snapshot()
   if(mounted.current){setSnapshot(value);setError('')}
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:String(e))}
  finally{
   reading.current=false
   if(mounted.current)setLoading(false)
   if(pending.current&&mounted.current){pending.current=false;void refresh()}
  }
 },[])
 useEffect(()=>{
  mounted.current=true
  void refresh()
  let timer:ReturnType<typeof setTimeout>|undefined
  const schedule=()=>{if(!timer&&document.visibilityState!=='hidden')timer=setTimeout(()=>{timer=undefined;void refresh()},500)}
  const off=window.toolDock.dashboard.onChange(schedule)
  const polling=setInterval(()=>{if(document.visibilityState!=='hidden')void refresh()},15000)
  const visible=()=>{if(document.visibilityState==='visible')schedule()}
  document.addEventListener('visibilitychange',visible)
  return()=>{mounted.current=false;pending.current=false;off();clearInterval(polling);clearTimeout(timer);document.removeEventListener('visibilitychange',visible)}
 },[refresh])
 return {snapshot,error,loading,refresh}
}
