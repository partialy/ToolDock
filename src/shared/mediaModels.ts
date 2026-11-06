import {z} from 'zod'

export const mediaKindSchema=z.enum(['extract','subtitle'])
export type MediaKind=z.infer<typeof mediaKindSchema>
export const mediaPreferencesSchema=z.strictObject({
 outputFormat:z.enum(['mp3','wav','flac','m4a','copy']).default('mp3'),bitrate:z.enum(['128k','192k','256k','320k']).default('192k'),
 outputDirectory:z.string().max(4096).default(''),computeMode:z.enum(['auto','cpu','gpu']).default('auto'),
 language:z.enum(['auto','zh','en']).default('auto'),selectedModelId:z.string().max(100).default('small'),
 modelDirectory:z.string().max(4096).default(''),accelerationEnabled:z.boolean().default(false),parallelSegments:z.number().int().min(1).max(8).default(4),
 ffmpegOverride:z.string().max(4096).default('')
})
export type MediaPreferences=z.infer<typeof mediaPreferencesSchema>
export const defaultMediaPreferences=mediaPreferencesSchema.parse({})
export interface AudioTrack {index:number;codec:string;language:string;title:string;channels:number}
export interface MediaProbe {duration:number;hasVideo:boolean;audioTracks:AudioTrack[]}
export type MediaTaskState='ready'|'queued'|'running'|'completed'|'failed'|'cancelled'|'interrupted'
export interface MediaTask {id:string;kind:MediaKind;inputPath:string;name:string;probe:MediaProbe;audioIndex:number;state:MediaTaskState;percent:number;outputPath:string;error:string;device:string;fallbackReason:string;createdAt:number;updatedAt:number;finishedAt?:number;attempts:number;options?:MediaPreferences;temporaryPath?:string}
export interface ModelRecord {id:string;name:string;bytes:number;sha256:string;url:string;path?:string;installed:boolean;verified:boolean;reference?:boolean}
export interface DownloadState {id:string;state:'downloading'|'paused'|'verifying'|'completed'|'failed'|'cancelled';received:number;total:number;error?:string;message?:string}
export interface EngineRecord {cpuAvailable:boolean;cudaAvailable:boolean;gpuName?:string;gpuMemory?:string;version?:string}
export interface MediaSnapshot {tasks:MediaTask[];preferences:MediaPreferences;models:ModelRecord[];downloads:DownloadState[];engines:EngineRecord;busy:boolean}
export interface MediaAddResult {added:number;skipped:{path:string;reason:string}[]}
export interface MediaAPI {
 status():Promise<MediaSnapshot>;chooseFiles(kind:MediaKind):Promise<string[]>;chooseFolder():Promise<string|null>;addSources(paths:string[],kind:MediaKind):Promise<MediaAddResult>;
 start(ids:string[],preferences:MediaPreferences):Promise<void>;cancel(id:string):Promise<void>;retry(id:string):Promise<void>;clearFinished():Promise<void>;setAudioTrack(id:string,index:number):Promise<void>;
 chooseOutputDirectory():Promise<string|null>;openOutput(id:string):Promise<void>;preview(id:string):Promise<string>;exportSubtitle(id:string):Promise<string|null>;
 setPreferences(patch:Partial<MediaPreferences>):Promise<void>;chooseFfmpeg():Promise<string|null>;
 models:{download(id:string):Promise<void>;pause(id:string):Promise<void>;resume(id:string):Promise<void>;cancel(id:string):Promise<void>;import(reference:boolean):Promise<void>;remove(id:string):Promise<void>;chooseDirectory():Promise<string|null>;migrateDirectory(path:string,move:boolean):Promise<void>};
 engines:{installCuda():Promise<void>;removeCuda():Promise<void>};onChange(cb:()=>void):()=>void
}
