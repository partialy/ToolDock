import { contextBridge, ipcRenderer } from 'electron'
const invoke=(channel:string,payload?:unknown)=>ipcRenderer.invoke(channel,payload)
const api={
 codecPipelines:{list:()=>invoke('codecPipelines:list'),get:(id:string)=>invoke('codecPipelines:get',id),create:(data:unknown)=>invoke('codecPipelines:create',data),update:(id:string,expectedRevision:number,data:unknown)=>invoke('codecPipelines:update',{id,expectedRevision,data}),duplicate:(id:string,newName?:string)=>invoke('codecPipelines:duplicate',{id,newName}),remove:(id:string,expectedRevision?:number)=>invoke('codecPipelines:remove',{id,expectedRevision})},
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
 transfer:{
  interfaces:()=>invoke('transfer:interfaces'),status:()=>invoke('transfer:status'),start:(address:string)=>invoke('transfer:start',address),stop:()=>invoke('transfer:stop'),
  chooseShares:()=>invoke('transfer:chooseShares'),removeShare:(id:string)=>invoke('transfer:removeShare',id),
  chooseDirectory:()=>invoke('transfer:chooseDirectory'),setPrefs:(prefs:unknown)=>invoke('transfer:setPrefs',prefs),
  approve:(id:string)=>invoke('transfer:approve',id),reject:(id:string)=>invoke('transfer:reject',id),
  approveMany:(ids:string[])=>invoke('transfer:approveMany',ids),rejectMany:(ids:string[])=>invoke('transfer:rejectMany',ids),
  cancelTask:(id:string)=>invoke('transfer:cancelTask',id),revokeDevice:(id:string)=>invoke('transfer:revokeDevice',id),
  onChange:(cb:(data:unknown)=>void)=>{const fn=(_e:Electron.IpcRendererEvent,data:unknown)=>cb(data);ipcRenderer.on('transfer:changed',fn);return()=>ipcRenderer.off('transfer:changed',fn)},
  onPending:(cb:(data:unknown)=>void)=>{const fn=(_e:Electron.IpcRendererEvent,data:unknown)=>cb(data);ipcRenderer.on('transfer:pending',fn);return()=>ipcRenderer.off('transfer:pending',fn)}
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
