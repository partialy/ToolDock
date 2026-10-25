import type { Category, Tool, Settings, DataInfo, CryptoResult } from './models'
export interface ToolDockAPI {
  window: { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; isMaximized(): Promise<boolean> }
  categories: { list(): Promise<Category[]>; save(input: Partial<Category> & {name: string}): Promise<Category>; remove(id:string):Promise<void>; reorder(ids:string[]):Promise<void> }
  tools: { list(): Promise<Tool[]>; save(input: Partial<Tool> & {name: string; categoryId:string; type:string; target:string}):Promise<Tool>; remove(id:string):Promise<void>; reorder(categoryId:string,ids:string[]):Promise<void> }
  settings: { get():Promise<Settings>; set<K extends keyof Settings>(key:K,value:Settings[K]):Promise<Settings> }
  views: { open(id:string):Promise<void>; bounds(rect:{x:number;y:number;width:number;height:number}):Promise<void>; hide():Promise<void>; show():Promise<void>; reload():Promise<void>; clearData(id:string):Promise<void>; onStatus(cb:(status:{status:string;message?:string})=>void):()=>void }
  data: { getInfo():Promise<DataInfo>; choose():Promise<string|null>; migrate(path:string):Promise<{restartRequired:boolean}>; deleteOld(id:string):Promise<void>; openFolder():Promise<void>; backup():Promise<string|null>; restore():Promise<{restartRequired:boolean}|null>; restart():Promise<void>; exportLogs():Promise<string|null>; clearLogs():Promise<void> }
  crypto: { rsa(bits:number,passphrase?:string):Promise<CryptoResult>; ssh(kind:'ed25519'|'rsa',bits:number,comment:string,passphrase?:string):Promise<CryptoResult>; aes(bits:128|256):Promise<CryptoResult>; random(length:number,alphabet:string):Promise<CryptoResult> }
}
declare global { interface Window { toolDock: ToolDockAPI } }
export {}
