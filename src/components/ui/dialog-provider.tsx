import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {AlertTriangle,HelpCircle,Info,LoaderCircle} from 'lucide-react'
import {Button} from './button'
import {DialogShell} from './dialog-shell'

export type DialogVariant='info'|'confirm'|'warning'|'danger'
export type ConfirmOptions={title:string;description:string;confirmText?:string;cancelText?:string;variant?:DialogVariant;dismissible?:boolean}
export type AlertOptions={title:string;description:string;buttonText?:string;variant?:'info'|'warning'|'danger'}
export type ActionOptions=ConfirmOptions&{onConfirm:()=>Promise<void>}
type Request={id:number;type:'confirm'|'alert'|'action';options:ConfirmOptions;action?:()=>Promise<void>;resolve:(v:boolean)=>void}
type Service={confirm:(o:ConfirmOptions)=>Promise<boolean>;alert:(o:AlertOptions)=>Promise<void>;confirmAction:(o:ActionOptions)=>Promise<boolean>}
const Context=createContext<Service|null>(null)
export function useDialog():Service{const api=useContext(Context);if(!api)throw Error('useDialog 必须位于 DialogProvider 内');return api}
export function DialogProvider({children}:{children:ReactNode}){
 const [current,setCurrent]=useState<Request|null>(null),[working,setWorking]=useState(false),[error,setError]=useState('')
 const queue=useRef<Request[]>([]),active=useRef<Request|null>(null),serial=useRef(0),locked=useRef(false)
 const cancelRef=useRef<HTMLButtonElement>(null)
 const advance=useCallback(()=>{
  const next=queue.current.shift()||null;active.current=next;locked.current=false;setWorking(false);setError('');setCurrent(next)
 },[])
 const enqueue=useCallback((type:Request['type'],options:ConfirmOptions,action?:()=>Promise<void>)=>{
  return new Promise<boolean>(resolve=>{
   if(queue.current.length>=12){resolve(false);return}
   const request={id:++serial.current,type,options,action,resolve}
   if(active.current)queue.current.push(request)
   else{active.current=request;setCurrent(request);setError('')}
  })
 },[])
 const service:Service={
  confirm:options=>enqueue('confirm',options),
  alert:async options=>{await enqueue('alert',{title:options.title,description:options.description,confirmText:options.buttonText||'我知道了',variant:options.variant||'info'})},
  confirmAction:options=>enqueue('action',options,options.onConfirm)
 }
 useEffect(()=>()=>{active.current?.resolve(false);queue.current.forEach(item=>item.resolve(false));queue.current=[];active.current=null},[])
 const close=(accepted=false)=>{
  if(locked.current)return
  const request=active.current
  if(!request)return
  request.resolve(accepted);advance()
 }
 const confirm=async()=>{
  if(locked.current||!active.current)return
  const request=active.current
  if(request.type!=='action'){close(true);return}
  locked.current=true;setWorking(true)
  try{await request.action?.();locked.current=false;close(true)}
  catch(e){locked.current=false;setWorking(false);setError(e instanceof Error?e.message:String(e))}
 }
 const options=current?.options
 const warning=options?.variant==='warning'||options?.variant==='danger'
 return <Context.Provider value={service}>
  {children}
  <DialogShell open={!!current} onOpenChange={v=>{if(!v&&!locked.current)close(false)}}
   title={options?.title||'确认操作'} description={options?.description} width="sm"
   dismissible={!working&&options?.dismissible!==false} hideClose={working}
   onOpenAutoFocus={e=>{if(current?.type!=='alert'){e.preventDefault();cancelRef.current?.focus()}}}
   footer={<>
    {current?.type!=='alert'&&<Button ref={cancelRef} disabled={working} onClick={()=>close(false)}>{options?.cancelText||'取消'}</Button>}
    <Button variant={options?.variant==='danger'?'danger':'primary'} disabled={working} onClick={()=>void confirm()}>
     {working&&<LoaderCircle size={15} className="animate-spin"/>}{working?'执行中…':options?.confirmText||'确认'}
    </Button>
   </>}>
    <div className="flex gap-3">
     {options?.variant==='danger'?<AlertTriangle className="shrink-0 text-red-400" size={22}/>:warning?<AlertTriangle className="shrink-0 text-amber-400" size={22}/>:options?.variant==='info'?<Info className="shrink-0 text-indigo-400" size={22}/>:<HelpCircle className="shrink-0 text-indigo-400" size={22}/>}
     <div className="min-w-0 flex-1">
      {warning&&<p className="text-xs leading-6 muted">{options?.variant==='danger'?'此操作可能无法恢复，请确认操作对象和影响范围。':'该操作存在风险，请确认后继续。'}</p>}
      {error&&<p role="alert" className="mt-2 break-words rounded-lg border border-red-500/30 p-2 text-xs text-red-400">{error}</p>}
     </div>
    </div>
   </DialogShell>
 </Context.Provider>
}
