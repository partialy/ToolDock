export type NotificationPosition='top-left'|'top-right'|'bottom-left'|'bottom-right'
export type TransferPreferences={
 receiveDirectory:string|null
 allowDownload:boolean
 allowUpload:boolean // legacy: the original receive-to-host permission
 allowPoolUpload:boolean
 allowPoolDownload:boolean
 tempDirectory:string|null
 maxFileBytes:number
 maxTempBytes:number
 maxUploads:number
 maxDownloads:number
}
export type LanInterface={id:string;name:string;address:string;netmask:string}
export type SharedFile={id:string;name:string;size:number;mtimeMs:number;status:'ready'|'changed'|'missing';kind:'file'|'directory';path?:string}
export type ShareHistory={id:string;path:string;name:string;kind:'file'|'directory';createdAt:number;lastUsedAt:number;available?:boolean}
export type DirectoryPage={parentId:string;items:Pick<SharedFile,'id'|'name'|'size'|'kind'|'status'>[];nextCursor:string|null;total:number}
export type DirectoryStats={files:number;directories:number;bytes:number;truncated:boolean}
export type AddSourcesResult={added:number;skipped:number;errors:string[]}
export type IncomingFile={id:string;name:string;size:number;received:number;ip:string;status:'uploading'|'paused'|'pending'|'accepted'|'rejected'|'failed';savedAs?:string}
export type DeviceInfo={id:string;ip:string;agent:string;connectedAt:number;lastSeen:number;name?:string}
export type TransferTask={id:string;name:string;direction:'upload'|'download';total:number;completed:number;status:string;ip:string}
export type PoolItem={id:string;name:string;kind:'file'|'directory';size:number;parentId:string|null;createdAt:number;deviceId:string;deviceName:string}
export type PoolPage={parentId:string|null;items:PoolItem[];nextCursor:string|null;total:number;usedBytes:number;itemCount:number}
export type PoolMessage={id:string;deviceId:string;deviceName:string;createdAt:number;charCount:number;bytes:number;preview:string;kind:'text'|'file';text?:string}
export type PoolMessagesPage={items:PoolMessage[];total:number}
export type PoolStatus={usedBytes:number;reservedBytes:number;limitBytes:number;messageBytes:number;fileCount:number;messageCount:number}
export type TransferSnapshot={running:boolean;port:number|null;address:string|null;url:string|null;pin:string|null;qrUrl:string|null;interfaces:LanInterface[];shares:SharedFile[];incoming:IncomingFile[];devices:DeviceInfo[];tasks:TransferTask[];prefs:TransferPreferences;pool:PoolStatus}
export const TRANSFER_DEFAULTS:TransferPreferences={receiveDirectory:null,allowDownload:true,allowUpload:false,allowPoolUpload:true,allowPoolDownload:true,tempDirectory:null,maxFileBytes:20*1024**3,maxTempBytes:20*1024**3,maxUploads:2,maxDownloads:4}
