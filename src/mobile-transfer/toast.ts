import {icon} from './icons'

type ToastKind='success'|'error'|'warning'|'info'
const MAX_VISIBLE=4
let lastMessage='',lastAt=0
const viewport=()=>document.getElementById('toasts')
function remove(item:HTMLElement){
 item.classList.add('toast-out')
 setTimeout(()=>item.remove(),160)
}
function show(kind:ToastKind,message:string,duration=2500){
 const root=viewport()
 if(!root||!message)return
 // 去掉 Error: 前缀，保持手机端提示可读。
 message=message.replace(/Error:\s*/g,'')
 // 同一错误在自动刷新场景下可能连续出现，短时间内的重复内容只提示一次。
 const now=Date.now()
 if(kind==='error'&&message===lastMessage&&now-lastAt<1500)return
 lastMessage=message;lastAt=now
 const item=document.createElement('div')
 item.className='toast '+kind
 item.setAttribute('role',kind==='error'?'alert':'status')
 const text=document.createElement('p')
 text.className='toast-text';text.textContent=message
 item.append(text)
 if(kind==='error'){
  const close=document.createElement('button')
  close.type='button';close.className='toast-close';close.setAttribute('aria-label','关闭提示')
  close.append(icon('close'));close.onclick=()=>remove(item)
  item.append(close)
 }
 root.append(item)
 while(root.children.length>MAX_VISIBLE)root.firstElementChild?.remove()
 setTimeout(()=>remove(item),duration)
}
/** 手机页轻量消息提示，语义对齐桌面端 msg.success/error/warning/info。 */
export const toast={
 success:(message:string)=>show('success',message),
 error:(message:string)=>show('error',message,4000),
 warning:(message:string)=>show('warning',message),
 info:(message:string)=>show('info',message)
}
