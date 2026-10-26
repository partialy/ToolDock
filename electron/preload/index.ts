import { contextBridge, ipcRenderer } from 'electron'
const invoke=(channel:string,payload?:unknown)=>ipcRenderer.invoke(channel,payload)
const api={
 window:{
  minimize:()=>invoke('window:minimize'),toggleMaximize:()=>invoke('window:toggleMaximize'),
  close:()=>invoke('window:close'),isMaximized:()=>invoke('window:isMaximized')
 },
 categories:{list:()=>invoke('categories:list'),save:(x:unknown)=>invoke('categories:save',x),remove:(id:string)=>invoke('categories:remove',id),reorder:(ids:string[])=>invoke('categories:reorder',ids)},
 tools:{list:()=>invoke('tools:list'),save:(x:unknown)=>invoke('tools:save',x),remove:(id:string)=>invoke('tools:remove',id),reorder:(categoryId:string,ids:string[])=>invoke('tools:reorder',{categoryId,ids})},
 settings:{get:()=>invoke('settings:get'),set:(key:string,value:unknown)=>invoke('settings:set',{key,value})},
 views:{
  open:(id:string)=>invoke('views:open',id),bounds:(rect:unknown)=>invoke('views:bounds',rect),
  hide:()=>invoke('views:hide'),show:()=>invoke('views:show'),reload:()=>invoke('views:reload'),clearData:(id:string)=>invoke('views:clearData',id),
  onStatus:(callback:(arg:unknown)=>void)=>{const fn=(_event:Electron.IpcRendererEvent,status:unknown)=>callback(status);ipcRenderer.on('view:status',fn);return()=>ipcRenderer.removeListener('view:status',fn)}
 },
 data:{
  getInfo:()=>invoke('data:info'),choose:()=>invoke('data:choose'),migrate:(p:string)=>invoke('data:migrate',p),
  deleteOld:(id:string)=>invoke('data:deleteOld',id),openFolder:()=>invoke('data:openFolder'),
  backup:()=>invoke('data:backup'),restore:()=>invoke('data:restore'),restart:()=>invoke('data:restart'),
  exportLogs:()=>invoke('data:exportLogs'),clearLogs:()=>invoke('data:clearLogs')
 },
 export:{
  start:(name:string,format:string)=>invoke('export:start',{name,format}),
  chunk:(id:string,bytes:Uint8Array)=>invoke('export:chunk',{id,bytes}),
  finish:(id:string)=>invoke('export:finish',id),
  cancel:(id:string)=>invoke('export:cancel',id)
 },
 crypto:{
  rsa:(bits:number,passphrase?:string)=>invoke('crypto:rsa',{bits,passphrase}),
  ssh:(kind:'ed25519'|'rsa',bits:number,comment:string,passphrase?:string)=>invoke('crypto:ssh',{kind,bits,comment,passphrase}),
  ec:(curve:'P-256'|'P-384',passphrase?:string)=>invoke('crypto:ec',{curve,passphrase}),
  aes:(bits:number)=>invoke('crypto:aes',bits),
  random:(length:number,alphabet:string,groups?:string[])=>invoke('crypto:random',{length,alphabet,groups})
 }
}
contextBridge.exposeInMainWorld('toolDock',api)
