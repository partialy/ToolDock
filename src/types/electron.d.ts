import type { Category, Tool, Settings, DataInfo, CryptoResult } from './models'
import type {PipelineInput,PipelineSaved,PipelineSummary} from '../shared/codecModels'
import type {TransferPreferences,TransferSnapshot,SharedFile,LanInterface} from '../shared/fileTransferModels'
export interface ToolDockAPI {
  codecPipelines:{list():Promise<PipelineSummary[]>;get(id:string):Promise<PipelineSaved>;create(data:PipelineInput):Promise<PipelineSaved>;update(id:string,expectedRevision:number,data:PipelineInput):Promise<PipelineSaved>;duplicate(id:string,newName?:string):Promise<PipelineSaved>;remove(id:string,expectedRevision?:number):Promise<void>}
  window: { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; isMaximized(): Promise<boolean> }
  categories: { list(): Promise<Category[]>; save(input: Partial<Category> & {name: string}): Promise<Category>; remove(id:string):Promise<void>; reorder(ids:string[]):Promise<void> }
  tools: { list(): Promise<Tool[]>; save(input: Partial<Tool> & {name: string; categoryId:string; type:string; target:string}):Promise<Tool>; remove(id:string):Promise<void>; reorder(categoryId:string,ids:string[]):Promise<void> }
  settings: { get():Promise<Settings>; set<K extends keyof Settings>(key:K,value:Settings[K]):Promise<Settings> }
  views: { open(id:string):Promise<void>; bounds(rect:{x:number;y:number;width:number;height:number}):Promise<void>; hide():Promise<void>; show():Promise<void>; reload():Promise<void>; clearData(id:string):Promise<void>; onStatus(cb:(status:{status:string;message?:string})=>void):()=>void }
  data: { getInfo():Promise<DataInfo>; choose():Promise<string|null>; migrate(path:string):Promise<{restartRequired:boolean}>; deleteOld(id:string):Promise<void>; openFolder():Promise<void>; backup():Promise<string|null>; restore():Promise<{restartRequired:boolean}|null>; restart():Promise<void>; exportLogs():Promise<string|null>; clearLogs():Promise<void> }
  transfer:{interfaces():Promise<LanInterface[]>;status():Promise<TransferSnapshot>;start(address:string):Promise<TransferSnapshot>;stop():Promise<void>;chooseShares():Promise<SharedFile[]>;removeShare(id:string):Promise<void>;chooseDirectory():Promise<string|null>;setPrefs(prefs:Omit<TransferPreferences,'receiveDirectory'>):Promise<TransferPreferences>;approve(id:string):Promise<unknown>;reject(id:string):Promise<void>;approveMany(ids:string[]):Promise<unknown[]>;rejectMany(ids:string[]):Promise<void>;cancelTask(id:string):Promise<void>;revokeDevice(id:string):Promise<void>;onChange(cb:(data:TransferSnapshot)=>void):()=>void;onPending(cb:(data:{id:string;name:string;size:number})=>void):()=>void}
  export: {start(name:string,format:'zip'|'png'|'jpg'|'webp'|'gif'|'bmp'|'ico'|'txt'|'svg'):Promise<string|null>;chunk(id:string,bytes:Uint8Array):Promise<void>;finish(id:string):Promise<string>;cancel(id:string):Promise<void>}
  crypto: { rsa(bits:number,passphrase?:string):Promise<CryptoResult>; ssh(kind:'ed25519'|'rsa',bits:number,comment:string,passphrase?:string):Promise<CryptoResult>; ec(curve:'P-256'|'P-384',passphrase?:string):Promise<CryptoResult>; aes(bits:128|256):Promise<CryptoResult>; random(length:number,alphabet:string,groups?:string[]):Promise<CryptoResult> }
}
declare global { interface Window { toolDock: ToolDockAPI } }
export {}
