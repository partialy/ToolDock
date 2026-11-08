import { contextBridge, ipcRenderer, webUtils } from 'electron'
const invoke=(channel:string,payload?:unknown)=>ipcRenderer.invoke(channel,payload)
const api={
 dashboard:{
  snapshot:()=>invoke('dashboard:snapshot'),
  onChange:(cb:()=>void)=>{
   const listener=()=>cb(),channels=['quickLaunch:changed','media:changed','textConversion:changed','transfer:changed']
   channels.forEach(channel=>ipcRenderer.on(channel,listener))
   return()=>channels.forEach(channel=>ipcRenderer.off(channel,listener))
  }
 },
 appNav:{
  ready:()=>invoke('app:ready'),
  onNavigate:(callback:(target:{toolId:string;taskType?:string;taskId?:string})=>void)=>{
   const fn=(_event:Electron.IpcRendererEvent,target:{toolId:string;taskType?:string;taskId?:string})=>callback(target)
   ipcRenderer.on('app:navigate',fn)
   return()=>ipcRenderer.off('app:navigate',fn)
  }
 },
 media:{
  status:()=>invoke('media:status'),chooseFiles:(kind:string)=>invoke('media:chooseFiles',kind),chooseFolder:()=>invoke('media:chooseFolder'),addSources:(paths:string[],kind:string)=>invoke('media:addSources',{paths,kind}),
  start:(ids:string[],preferences:unknown)=>invoke('media:start',{ids,preferences}),cancel:(id:string)=>invoke('media:cancel',id),retry:(id:string)=>invoke('media:retry',id),clearFinished:()=>invoke('media:clearFinished'),setAudioTrack:(id:string,index:number)=>invoke('media:setAudioTrack',{id,index}),
  chooseOutputDirectory:()=>invoke('media:chooseOutputDirectory'),openOutput:(id:string)=>invoke('media:openOutput',id),preview:(id:string)=>invoke('media:preview',id),exportSubtitle:(id:string)=>invoke('media:exportSubtitle',id),setPreferences:(patch:unknown)=>invoke('media:setPreferences',patch),chooseFfmpeg:()=>invoke('media:chooseFfmpeg'),
  models:{download:(id:string)=>invoke('media:models:download',id),pause:(id:string)=>invoke('media:models:pause',id),resume:(id:string)=>invoke('media:models:resume',id),cancel:(id:string)=>invoke('media:models:cancel',id),import:(reference:boolean)=>invoke('media:models:import',reference),remove:(id:string)=>invoke('media:models:remove',id),chooseDirectory:()=>invoke('media:models:chooseDirectory'),migrateDirectory:(path:string,move:boolean)=>invoke('media:models:migrateDirectory',{path,move})},
  engines:{installCuda:()=>invoke('media:engines:installCuda'),removeCuda:()=>invoke('media:engines:removeCuda')},
  onChange:(cb:()=>void)=>{const fn=()=>cb();ipcRenderer.on('media:changed',fn);return()=>ipcRenderer.off('media:changed',fn)}
 },
 textConversion:{
  status:()=>invoke('textConversion:status'),chooseFiles:()=>invoke('textConversion:chooseFiles'),chooseFolder:()=>invoke('textConversion:chooseFolder'),
  addSources:(paths:string[])=>invoke('textConversion:addSources',paths),start:(ids:string[],force=false)=>invoke('textConversion:start',{ids,force}),
  cancel:(id:string)=>invoke('textConversion:cancel',id),remove:(ids:string[])=>invoke('textConversion:remove',ids),
  rename:(id:string,name:string)=>invoke('textConversion:rename',{id,name}),setEncoding:(id:string,encoding:string)=>invoke('textConversion:setEncoding',{id,encoding}),
  setPreferences:(patch:unknown)=>invoke('textConversion:setPreferences',patch),
  preview:(id:string,side:'source'|'result',offset:number,length:number)=>invoke('textConversion:preview',{id,side,offset,length}),
  search:(id:string,side:'source'|'result',query:string,from=0)=>invoke('textConversion:search',{id,side,query,from}),
  saveOne:(id:string)=>invoke('textConversion:saveOne',id),saveSelected:(ids:string[])=>invoke('textConversion:saveSelected',ids),saveZip:(ids:string[])=>invoke('textConversion:saveZip',ids),
  onChange:(cb:()=>void)=>{const fn=()=>cb();ipcRenderer.on('textConversion:changed',fn);return()=>ipcRenderer.off('textConversion:changed',fn)}
 },
 quickLaunch:{
  list:()=>invoke('quickLaunch:list'),tasks:()=>invoke('quickLaunch:tasks'),save:(input:unknown)=>invoke('quickLaunch:save',input),
  setVisible:(id:string,revision:number,visible:boolean)=>invoke('quickLaunch:setVisible',{id,revision,visible}),remove:(id:string,revision:number)=>invoke('quickLaunch:remove',{id,revision}),
  reorderApps:(groupId:string,ids:string[])=>invoke('quickLaunch:reorderApps',{groupId,ids}),
  saveGroup:(name:string,id?:string)=>invoke('quickLaunch:saveGroup',{name,id}),removeGroup:(id:string)=>invoke('quickLaunch:removeGroup',id),reorderGroups:(ids:string[])=>invoke('quickLaunch:reorderGroups',ids),
  chooseScript:(shell:string)=>invoke('quickLaunch:chooseScript',shell),chooseIcon:()=>invoke('quickLaunch:chooseIcon'),chooseWorkingDirectory:()=>invoke('quickLaunch:chooseWorkingDirectory'),openResources:(id:string)=>invoke('quickLaunch:openResources',id),
  run:(id:string,revision:number,confirmed:boolean)=>invoke('quickLaunch:run',{id,revision,confirmed}),task:(id:string)=>invoke('quickLaunch:task',id),stop:(id:string)=>invoke('quickLaunch:stop',id),reconcile:()=>invoke('quickLaunch:reconcile'),clearUnknown:(id:string,confirmed:boolean)=>invoke('quickLaunch:clearUnknown',{id,confirmed}),
  onChange:(cb:()=>void)=>{const fn=()=>cb();ipcRenderer.on('quickLaunch:changed',fn);return()=>ipcRenderer.off('quickLaunch:changed',fn)}
 },
 commands:{queryPort:(port:number)=>invoke('commands:queryPort',port),terminate:(input:unknown)=>invoke('commands:terminate',input),chooseDirectory:()=>invoke('commands:chooseDirectory'),validateJunction:(input:unknown)=>invoke('commands:validateJunction',input),createJunction:(input:unknown)=>invoke('commands:createJunction',input),openFolder:(path:string)=>invoke('commands:openFolder',path)},
 codecPipelines:{list:()=>invoke('codecPipelines:list'),get:(id:string)=>invoke('codecPipelines:get',id),create:(data:unknown)=>invoke('codecPipelines:create',data),update:(id:string,expectedRevision:number,data:unknown)=>invoke('codecPipelines:update',{id,expectedRevision,data}),duplicate:(id:string,newName?:string)=>invoke('codecPipelines:duplicate',{id,newName}),remove:(id:string,expectedRevision?:number)=>invoke('codecPipelines:remove',{id,expectedRevision})},
 window:{
  minimize:()=>invoke('window:minimize'),toggleMaximize:()=>invoke('window:toggleMaximize'),
  close:()=>invoke('window:close'),isMaximized:()=>invoke('window:isMaximized')
 },
 categories:{list:()=>invoke('categories:list'),save:(x:unknown)=>invoke('categories:save',x),remove:(id:string)=>invoke('categories:remove',id),reorder:(ids:string[])=>invoke('categories:reorder',ids)},
 tools:{list:()=>invoke('tools:list'),save:(x:unknown)=>invoke('tools:save',x),remove:(id:string)=>invoke('tools:remove',id),reorder:(categoryId:string,ids:string[])=>invoke('tools:reorder',{categoryId,ids}),pin:(id:string,pinned:boolean)=>invoke('tools:pin',{id,pinned}),reorderPins:(ids:string[])=>invoke('tools:reorderPins',ids)},
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
  pathForDroppedFile:(file:File)=>{try{return webUtils.getPathForFile(file)}catch{return ''}},
  chooseShares:()=>invoke('transfer:chooseShares'),chooseFiles:()=>invoke('transfer:chooseFiles'),chooseFolders:()=>invoke('transfer:chooseFolders'),
  addSources:(paths:string[])=>invoke('transfer:addSources',paths),
  pool:{preview:(id:string)=>invoke('transfer:pool:preview',id),list:(parentId:string|null=null,cursor=0,search='',sort='newest')=>invoke('transfer:pool:list',{parentId,cursor,search,sort}),add:(paths:string[])=>invoke('transfer:pool:add',paths),pick:()=>invoke('transfer:pool:pick'),pickFolder:()=>invoke('transfer:pool:pickFolder'),remove:(ids:string[])=>invoke('transfer:pool:remove',ids),clear:()=>invoke('transfer:pool:clear'),save:(ids:string[])=>invoke('transfer:pool:save',ids)},
  messages:{list:()=>invoke('transfer:messages:list'),send:(text:string)=>invoke('transfer:messages:send',text),chunk:(id:string,offset:number)=>invoke('transfer:messages:chunk',{id,offset}),search:(id:string,query:string)=>invoke('transfer:messages:search',{id,query}),copy:(id:string)=>invoke('transfer:messages:copy',id),save:(id:string)=>invoke('transfer:messages:save',id),openLink:(url:string)=>invoke('transfer:messages:openLink',url),remove:(ids:string[])=>invoke('transfer:messages:remove',ids),clear:()=>invoke('transfer:messages:clear')},
  tempDirectory:()=>invoke('transfer:tempDirectory'),
  directory:(parentId:string,cursor?:string)=>invoke('transfer:directory',{parentId,cursor}),directoryStats:(id:string)=>invoke('transfer:directoryStats',id),
  history:{list:(search?:string)=>invoke('transfer:history:list',search||''),remove:(id:string)=>invoke('transfer:history:remove',id),clear:()=>invoke('transfer:history:clear'),restore:(ids:string[])=>invoke('transfer:history:restore',ids)},
  removeShare:(id:string)=>invoke('transfer:removeShare',id),
  setPrefs:(prefs:unknown)=>invoke('transfer:setPrefs',prefs),
  cancelTask:(id:string)=>invoke('transfer:cancelTask',id),revokeDevice:(id:string)=>invoke('transfer:revokeDevice',id),
  onChange:(cb:(data:unknown)=>void)=>{const fn=(_e:Electron.IpcRendererEvent,data:unknown)=>cb(data);ipcRenderer.on('transfer:changed',fn);return()=>ipcRenderer.off('transfer:changed',fn)}
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
