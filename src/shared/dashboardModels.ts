/** 工作台只读状态契约：不允许脚本正文、文件绝对路径、访问码或设备凭据穿过 IPC。 */
export type DashboardSource='quick-launch'|'audio-export'|'media-extract'|'media-subtitle'|'text-conversion'|'transfer-upload'|'transfer-download'|'model-download'
export type DashboardGroup='running'|'queued'|'completed'|'failed'|'ready'|'pending'|'paused'|'unknown'|'cancelled'
export type DashboardModule='quick-launch'|'video-processing'|'file-transfer'
export type DashboardTab='extract'|'subtitle'|'conversion'|'models'|'tasks'
export interface DashboardTask{
 key:string;id:string;source:DashboardSource;name:string;state:DashboardGroup;rawState:string
 progress:number|null;timestamp:number|null;reason:string
 module:DashboardModule;tab?:DashboardTab
}
export type DashboardProvider='quick-launch'|'media'|'text-conversion'|'transfer'
export interface DashboardSourceHealth{source:DashboardProvider;available:boolean}
export interface DashboardSnapshot{
 tasks:DashboardTask[];counts:{running:number;queued:number;completed:number;failed:number;unknown:number}
 health:DashboardSourceHealth[]
 service:{transferRunning:boolean|null;connectedDevices:number|null;pendingApprovals:number|null;modelDownloads:number|null}
 sampledAt:number
}
/** 页面内部可选的精确定位目标，seq 令同一路由内的重复定位生效。 */
export interface DashboardFocus{module:DashboardModule;tab?:DashboardTab;taskId:string;seq:number}
