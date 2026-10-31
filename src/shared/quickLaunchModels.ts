import { z } from 'zod'

export const quickLaunchInputSchema = z.strictObject({
 name:z.string().trim().min(1).max(80), description:z.string().max(500).default(''),
 groupId:z.string().min(1).max(60).default('ungrouped'),
 iconKind:z.enum(['lucide','managed']).default('lucide'), iconValue:z.string().max(160).default('terminal'),
 shell:z.enum(['powershell','cmd']).default('powershell'), psFlavor:z.enum(['windows','pwsh']).default('windows'),
 sourceKind:z.enum(['inline','file']).default('inline'), inlineContent:z.string().max(65536).default(''),
 workingDirectory:z.string().max(4096).default(''), silent:z.boolean().default(true), runAsAdmin:z.boolean().default(false),
 confirmBeforeRun:z.boolean().default(false), confirmTitle:z.string().max(500).default('提示'),
 confirmMessage:z.string().max(500).default(''), confirmAccept:z.string().max(500).default('确认'), confirmCancel:z.string().max(500).default('取消'),
 visible:z.boolean().default(true), scriptToken:z.uuid().optional(), iconToken:z.uuid().optional()
}).superRefine((v,c)=>{if(v.sourceKind==='inline'&&!v.inlineContent.trim())c.addIssue({code:'custom',path:['inlineContent'],message:'请输入执行命令'});if(BufferByteLength(v.inlineContent)>65536)c.addIssue({code:'custom',path:['inlineContent'],message:'命令不能超过 64 KiB'})})
function BufferByteLength(value:string){return new TextEncoder().encode(value).length}
export type QuickLaunchInput=z.infer<typeof quickLaunchInputSchema>
export interface QuickLaunchApp extends Omit<QuickLaunchInput,'scriptToken'|'iconToken'> {
 id:string;revision:number;sortOrder:number;createdAt:string;updatedAt:string;
 managedScript:string|null;scriptName:string|null;iconDataUrl?:string
}
export interface QuickLaunchGroup {id:string;name:string;sortOrder:number;createdAt:string;updatedAt:string}
export type QuickLaunchStatus='starting'|'running'|'completed'|'failed'|'unknown'
export interface QuickLaunchTask {
 id:string;appId:string;appName:string;status:QuickLaunchStatus;startedAt:string;endedAt?:string;
 pid?:number;runnerPid?:number;childPids:number[];exitCode?:number|null;reason?:string;
 commandSummary:string;silent:boolean;runAsAdmin:boolean;output:string;truncated:boolean;outputSequence?:number;connectionNote?:string
}
export interface QuickLaunchEnvironment {windowsPowerShell:string|null;pwsh:string|null;cmd:string|null}
export interface QuickLaunchSnapshot {apps:QuickLaunchApp[];groups:QuickLaunchGroup[];tasks:QuickLaunchTask[];environment:QuickLaunchEnvironment}
export interface QuickLaunchResource {token:string;name:string;preview?:string}
export interface QuickLaunchSave {id?:string;expectedRevision?:number;data:QuickLaunchInput}
export const quickLaunchSaveSchema=z.strictObject({id:z.uuid().optional(),expectedRevision:z.number().int().positive().optional(),data:quickLaunchInputSchema})
export const isQuickLaunchLocked=(task:Pick<QuickLaunchTask,'status'>)=>['starting','running','unknown'].includes(task.status)
export interface QuickLaunchAPI {
 list():Promise<QuickLaunchSnapshot>;tasks():Promise<QuickLaunchTask[]>;save(input:QuickLaunchSave):Promise<QuickLaunchApp>;
 setVisible(id:string,revision:number,visible:boolean):Promise<void>;remove(id:string,revision:number):Promise<void>;
 reorderApps(groupId:string,ids:string[]):Promise<void>;
 saveGroup(name:string,id?:string):Promise<QuickLaunchGroup>;removeGroup(id:string):Promise<void>;reorderGroups(ids:string[]):Promise<void>;
 chooseScript(shell:'powershell'|'cmd'):Promise<QuickLaunchResource|null>;chooseIcon():Promise<QuickLaunchResource|null>;
 chooseWorkingDirectory():Promise<string|null>;openResources(id:string):Promise<void>;
 run(id:string,revision:number,confirmed:boolean):Promise<QuickLaunchTask>;task(id:string):Promise<QuickLaunchTask>;
 stop(id:string):Promise<void>;reconcile():Promise<void>;clearUnknown(id:string,confirmed:boolean):Promise<void>;
 onChange(callback:()=>void):()=>void
}
