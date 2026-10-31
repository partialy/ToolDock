import {dialog,type BrowserWindow} from 'electron'
import {QuickLaunchDataService} from './quick-launch-resources'
import {QuickLaunchRunner} from './quick-launch-runner'
import {getDataRoot} from '../database/store'
import type {QuickLaunchSave} from '../../../src/shared/quickLaunchModels'

/** 配置、启动及数据目录变更共用一条队列，异步文件操作期间也不能绕过运行锁。 */
export class QuickLaunchService {
 private queue:Promise<unknown>=Promise.resolve()
 private closing=false
 private eventTimer:ReturnType<typeof setTimeout>|undefined
 private readonly runner:QuickLaunchRunner
 private readonly data:QuickLaunchDataService
 constructor(private window:()=>BrowserWindow|null){
  this.runner=new QuickLaunchRunner(getDataRoot,undefined,()=>this.changed())
  this.data=new QuickLaunchDataService(window,id=>this.runner.assertUnlocked(id))
 }
 private serial<T>(work:()=>T|Promise<T>):Promise<T>{
  const task=this.queue.then(work);this.queue=task.catch(()=>{});return task
 }
 private changed(){
  if(this.eventTimer)return
  this.eventTimer=setTimeout(()=>{this.eventTimer=undefined;const win=this.window();if(win&&!win.isDestroyed())win.webContents.send('quickLaunch:changed')},150)
 }
 async initialize(){await this.runner.initialize();this.data.retryCleanup()}
 list(){return this.serial(()=>({apps:this.data.listApps(),groups:this.data.listGroups(),tasks:this.runner.tasks().map(t=>({...t,output:''})),environment:this.runner.environment()}))}
 tasks(){return this.runner.tasks()}
 private mutate<T>(fn:()=>T|Promise<T>){return this.serial(async()=>{if(this.closing)throw Error('ToolDock 正在退出');await this.runner.reconcile();const result=await fn();this.changed();return result})}
 save(input:QuickLaunchSave){return this.mutate(()=>this.data.save(input))}
 setVisible(id:string,revision:number,visible:boolean){return this.mutate(()=>this.data.setVisible(id,revision,visible))}
 remove(id:string,revision:number){return this.mutate(()=>this.data.remove(id,revision))}
 reorderApps(groupId:string,ids:string[]){return this.mutate(()=>this.data.reorderApps(groupId,ids))}
 saveGroup(name:string,id?:string){return this.mutate(()=>this.data.saveGroup(name,id))}
 removeGroup(id:string){return this.mutate(()=>this.data.removeGroup(id))}
 reorderGroups(ids:string[]){return this.mutate(()=>this.data.reorderGroups(ids))}
 chooseScript(shell:'powershell'|'cmd'){return this.data.chooseScript(shell)}
 chooseIcon(){return this.data.chooseIcon()}
 openResources(id:string){return this.data.openResources(id)}
 async chooseWorkingDirectory(){const win=this.window();if(!win)throw Error('主窗口不可用');const result=await dialog.showOpenDialog(win,{title:'选择工作目录',properties:['openDirectory']});return result.canceled?null:result.filePaths[0]||null}
 run(id:string,revision:number,confirmed:boolean){return this.mutate(async()=>{
  const item=this.data.getApp(id)
  const existing=this.runner.tasks().find(t=>t.appId===id&&['starting','running','unknown'].includes(t.status))
  if(existing){if(existing.status==='unknown')throw Error('任务身份未知，请重新检测或确认解除未知状态');return this.runner.task(existing.id)}
  if(item.revision!==revision)throw Error('App 已被修改，请刷新后启动')
  if(item.confirmBeforeRun&&!confirmed)throw Error('请先确认运行此 App')
  const script=item.sourceKind==='file'?await this.data.resolveScript(item):null
  return this.runner.run(item,script)
 })}
 task(id:string){return this.runner.task(id)}
 stop(id:string){return this.serial(async()=>{await this.runner.stop(id);this.changed()})}
 reconcile(){return this.serial(async()=>{await this.runner.reconcile();this.changed()})}
 clearUnknown(id:string,confirmed:boolean){if(!confirmed)throw Error('解除未知状态需要明确确认');return this.serial(async()=>{await this.runner.clearUnknown(id);this.changed()})}
 dataMutation<T>(work:()=>T|Promise<T>){return this.serial(async()=>{
  if(this.closing)throw Error('ToolDock 正在退出')
  await this.runner.reconcile()
  if(this.runner.hasActive())throw Error('请先停止快捷启动任务或处理状态未知的任务，再变更数据目录/恢复/删除旧副本')
  const previousRoot=getDataRoot(),result=await work()
  if(getDataRoot()!==previousRoot||(result&&typeof result==='object'&&'restartRequired' in result&&result.restartRequired))await this.runner.reload()
  this.data.retryCleanup();this.changed();return result
 })}
 backup<T>(work:()=>T|Promise<T>){return this.serial(work)}
 async shutdown(stopOnExit:boolean){
  this.closing=true
  await this.serial(()=>this.runner.shutdown(stopOnExit))
  if(this.eventTimer)clearTimeout(this.eventTimer)
  await this.runner.dispose()
 }
}
