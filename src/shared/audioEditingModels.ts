import {z} from 'zod'

export const audioRangeSchema=z.strictObject({startUs:z.number().int().nonnegative().safe(),endUs:z.number().int().positive().safe()})
export type AudioRange=z.infer<typeof audioRangeSchema>
export const audioEditSchema=z.strictObject({
 kept:z.array(audioRangeSchema).min(1).max(512),
 fadeMs:z.number().min(0).max(100).default(8),
 effect:z.enum(['none','gain','normalize']).default('none'),
 gainDb:z.number().min(-20).max(20).default(0),
 loudnessLUFS:z.number().min(-36).max(-8).default(-16),
 truePeakDbtp:z.number().min(-9).max(-0.1).default(-1.5)
})
export type AudioEdit=z.infer<typeof audioEditSchema>
export const audioExportOptionsSchema=z.strictObject({
 format:z.enum(['mp3','wav','flac','m4a','copy']),
 bitrate:z.enum(['128k','192k','256k','320k']),
 directory:z.string().max(4096),
 name:z.string().min(1).max(180),
 sampleRate:z.enum(['source','44100','48000']).default('source'),
 channels:z.enum(['source','mono','stereo']).default('source')
})
export type AudioExportOptions=z.infer<typeof audioExportOptionsSchema>
export interface AudioStream {index:number;codec:string;sampleRate:number;channels:number;startUs:number;durationUs:number;language:string;title:string}
export interface AudioSource {path:string;name:string;type:'video'|'audio';size:number;mtimeMs:number;signature:string;streams:AudioStream[]}
export interface AudioProject {id:string;source:AudioSource;streamIndex:number;edit:AudioEdit;revision:number;displayName:string;outputName:string;createdAt:number;updatedAt:number;lastOpenedAt:number}
export type AudioJobState='queued'|'running'|'completed'|'failed'|'cancelled'|'interrupted'
export interface AudioExportJob {id:string;projectId:string;projectName:string;revision:number;edit:AudioEdit;stream:AudioStream;source:AudioSource;options:AudioExportOptions;state:AudioJobState;percent:number;error:string;outputPath:string;size:number;createdAt:number;startedAt?:number;finishedAt?:number}
export interface AudioPreferences {cacheLimitBytes:number;outputDirectory:string}
export interface AudioStatus {projects:AudioProject[];jobs:AudioExportJob[];busy:boolean;preferences:AudioPreferences}
export interface AudioPeaks {points:number[];durationUs:number}
export interface AudioAPI {
 status():Promise<AudioStatus>;chooseFiles():Promise<string[]>;chooseDirectory():Promise<string|null>;addSources(paths:string[]):Promise<{added:number;reused:number;skipped:{path:string;reason:string}[]}>;
 copy(id:string):Promise<AudioProject>;addTrack(id:string,index:number):Promise<AudioProject>;relink(id:string):Promise<AudioProject|null>;save(id:string,revision:number,edit:AudioEdit,outputName:string):Promise<AudioProject>;
 remove(ids:string[]):Promise<void>;setPreferences(patch:Partial<AudioPreferences>):Promise<void>;
 peaks(id:string,startUs:number,endUs:number,count:number):Promise<AudioPeaks>;
 preview(id:string,edited:boolean):Promise<string>;
 export(ids:string[],options:AudioExportOptions):Promise<void>;retry(jobId:string):Promise<void>;cancel(jobId:string):Promise<void>;open(jobId:string):Promise<void>;
 onChange(cb:()=>void):()=>void
}
export function canonicalKept(ranges:AudioRange[],durationUs:number):AudioRange[]{
 if(!Number.isSafeInteger(durationUs)||durationUs<10000)throw Error('音频时长无效')
 const sorted=ranges.map(x=>audioRangeSchema.parse(x)).sort((a,b)=>a.startUs-b.startUs)
 const result:AudioRange[]=[]
 for(const range of sorted){
  if(range.endUs>durationUs||range.endUs<=range.startUs)throw Error('音频区间超出有效范围')
  const prev=result.at(-1)
  if(prev&&range.startUs<=prev.endUs)prev.endUs=Math.max(prev.endUs,range.endUs)
  else result.push({...range})
 }
 if(!result.length||result.some(r=>r.endUs-r.startUs<10000))throw Error('不能删除全部音频；保留片段至少0.01秒')
 if(result.length>512)throw Error('最多保留512段')
 return result
}
export function subtractInterval(kept:AudioRange[],cut:AudioRange,durationUs:number){
 if(cut.endUs<=cut.startUs||cut.startUs<0||cut.endUs>durationUs)throw Error('裁切区间无效')
 return canonicalKept(kept.flatMap(s=>cut.endUs<=s.startUs||cut.startUs>=s.endUs?[s]:[
  ...(cut.startUs>s.startUs?[{startUs:s.startUs,endUs:cut.startUs}]:[]),
  ...(cut.endUs<s.endUs?[{startUs:cut.endUs,endUs:s.endUs}]:[])
 ]),durationUs)
}
export function keepInterval(kept:AudioRange[],range:AudioRange,durationUs:number){
 return canonicalKept(kept.map(s=>({startUs:Math.max(range.startUs,s.startUs),endUs:Math.min(range.endUs,s.endUs)})).filter(s=>s.endUs>s.startUs),durationUs)
}
export function estimatedDurationUs(edit:AudioEdit){
 const durations=edit.kept.map(r=>r.endUs-r.startUs)
 let output=durations.reduce((a,b)=>a+b,0)
 if(edit.fadeMs>0)for(let i=1;i<durations.length;i++)output-=Math.min(edit.fadeMs*1000,durations[i-1]/2,durations[i]/2)
 return Math.max(0,Math.round(output))
}
export function hasCuts(edit:AudioEdit,durationUs:number){
 return edit.kept.length!==1||edit.kept[0].startUs!==0||edit.kept[0].endUs!==durationUs
}
