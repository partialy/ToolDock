import type {QuickLaunchTask} from '../../../src/shared/quickLaunchModels'
import type {TransferSnapshot} from '../../../src/shared/fileTransferModels'
import type {MediaKind,MediaTaskState,DownloadState} from '../../../src/shared/mediaModels'
import type {ConversionState} from '../../../src/shared/textConversionModels'
import type {DashboardSnapshot,DashboardTask,DashboardSource,DashboardGroup,DashboardSourceHealth} from '../../../src/shared/dashboardModels'

export interface DashboardMediaItem{id:string;kind:MediaKind;name:string;state:MediaTaskState;percent:number;createdAt:number;updatedAt:number;error:string}
export interface DashboardAudioItem{id:string;name:string;state:string;percent:number;createdAt:number;updatedAt:number;error:string}
export interface DashboardConversionItem{id:string;name:string;state:ConversionState;percent:number;createdAt:number;updatedAt:number;error:string}
export interface DashboardInputs{
 quickLaunch?:QuickLaunchTask[]
 media?:{tasks:DashboardMediaItem[];downloads:DownloadState[];audioJobs?:DashboardAudioItem[]}
 conversion?:DashboardConversionItem[]
 transfer?:TransferSnapshot
}
/** 故障原因只保留简短说明，永不透出本机路径、URI、命令摘要、PIN。 */
export function safeDashboardReason(value:unknown):string{
 if(typeof value!=='string'||!value.trim())return ''
 // 路径可能含空格、引号和命令参数：发现路径/URL/凭据时不尝试局部脱敏，
 // 整条降级为通用错误，避免剩余片段泄漏文件名、口令或脚本命令。
 if(/(?:[A-Za-z]:[\\/]|\\\\|https?:\/\/|(?:token|password|secret|api[_-]?key)\s*[:=])/i.test(value))
  return '任务执行失败，请进入所属工具查看详情'
 return value.trim().slice(0,160)
}
const statusMap:Record<string,DashboardGroup>={
 starting:'running',running:'running',downloading:'running',uploading:'running',verifying:'running',
 queued:'queued',completed:'completed',accepted:'completed',failed:'failed',rejected:'cancelled',
 cancelled:'cancelled',interrupted:'unknown',unknown:'unknown',ready:'ready',pending:'pending',paused:'paused'
}
const group=(state:string):DashboardGroup=>statusMap[state]||'unknown'
const finiteProgress=(percent:number|null|undefined)=>typeof percent==='number'&&Number.isFinite(percent)?Math.max(0,Math.min(100,Math.round(percent))):null
const clock=(n:number|undefined)=>typeof n==='number'&&Number.isFinite(n)?n:null
const date=(value:string)=>{const n=Date.parse(value);return Number.isFinite(n)?n:null}
/** 完全纯函数；Provider 故障时只跳过对应模块，不将“未知”显示成 0 项。 */
export function assembleDashboard(inputs:DashboardInputs,failed:DashboardSourceHealth['source'][]=[]):DashboardSnapshot{
 const tasks:DashboardTask[]=[]
 const push=(source:DashboardSource,item:Omit<DashboardTask,'key'|'source'>)=>tasks.push({key:source+':'+item.id,source,...item})
 for(const task of inputs.quickLaunch||[])push('quick-launch',{
  id:task.id,name:task.appName||'快捷启动任务',state:group(task.status),rawState:task.status,
  progress:null,timestamp:date(task.endedAt||task.startedAt),reason:safeDashboardReason(task.reason),
  module:'quick-launch'
 })
 for(const task of inputs.media?.tasks||[])push(task.kind==='extract'?'media-extract':'media-subtitle',{
  id:task.id,name:task.name,state:group(task.state),rawState:task.state,progress:task.state==='running'?finiteProgress(task.percent):null,
  timestamp:clock(task.updatedAt||task.createdAt),reason:safeDashboardReason(task.error),
  module:'video-processing',tab:task.kind
 })
 for(const job of inputs.media?.audioJobs||[])push('audio-export',{
  id:job.id,name:job.name,state:group(job.state),rawState:job.state,progress:job.state==='running'?finiteProgress(job.percent):null,
  timestamp:clock(job.updatedAt||job.createdAt),reason:safeDashboardReason(job.error),module:'video-processing',tab:'extract'
 })
 for(const task of inputs.conversion||[])push('text-conversion',{
  id:task.id,name:task.name,state:group(task.state),rawState:task.state,
  progress:task.state==='running'?finiteProgress(task.percent):null,
  timestamp:clock(task.updatedAt||task.createdAt),reason:safeDashboardReason(task.error),
  module:'video-processing',tab:'conversion'
 })
 for(const task of inputs.transfer?.tasks||[])push(task.direction==='upload'?'transfer-upload':'transfer-download',{
  id:task.id,name:task.name,state:group(task.status),rawState:task.status,
  progress:task.total>0?finiteProgress(task.completed/task.total*100):null,timestamp:null,reason:'',
  module:'file-transfer',tab:'tasks'
 })
 for(const task of inputs.media?.downloads||[])push('model-download',{
  id:task.id,name:task.id==='cuda-engine'?'CUDA 计算引擎':('语音识别模型 '+task.id),state:group(task.state),rawState:task.state,
  progress:task.total>0?finiteProgress(task.received/task.total*100):null,timestamp:null,reason:safeDashboardReason(task.error),
  module:'video-processing',tab:'models'
 })
 const counts={running:0,queued:0,completed:0,failed:0,unknown:0}
 for(const task of tasks)if(task.state in counts)counts[task.state as keyof typeof counts]++
 const health:DashboardSourceHealth[]=(['quick-launch','media','text-conversion','transfer'] as const)
  .map(source=>({source,available:!failed.includes(source)}))
 const transfer=inputs.transfer
 return {tasks,counts,health,service:{
  transferRunning:transfer?.running??null,
  connectedDevices:transfer?transfer.devices.length:null,
  pendingApprovals:transfer?transfer.incoming.filter(item=>item.status==='pending').length:null,
  modelDownloads:inputs.media?inputs.media.downloads.filter(item=>['downloading','verifying'].includes(item.state)).length:null
 },sampledAt:Date.now()}
}
export async function getDashboardSnapshot(sources:{
 quickLaunch:()=>QuickLaunchTask[]|Promise<QuickLaunchTask[]>
 media:()=>{tasks:DashboardMediaItem[];downloads:DownloadState[]}|Promise<{tasks:DashboardMediaItem[];downloads:DownloadState[]}>
 conversion:()=>DashboardConversionItem[]|Promise<DashboardConversionItem[]>
 transfer:()=>TransferSnapshot|Promise<TransferSnapshot>
}):Promise<DashboardSnapshot>{
 const names=(['quick-launch','media','text-conversion','transfer'] as const)
 const result=await Promise.allSettled([Promise.resolve().then(sources.quickLaunch),Promise.resolve().then(sources.media),Promise.resolve().then(sources.conversion),Promise.resolve().then(sources.transfer)])
 const failed=names.filter((_,index)=>result[index].status==='rejected')
 const get=<T>(index:number):T|undefined=>result[index].status==='fulfilled'?(result[index] as PromiseFulfilledResult<unknown>).value as T:undefined
 return assembleDashboard({
  quickLaunch:get<QuickLaunchTask[]>(0),
  media:get<{tasks:DashboardMediaItem[];downloads:DownloadState[]}>(1),
  conversion:get<DashboardConversionItem[]>(2),
  transfer:get<TransferSnapshot>(3)
 },failed)
}
