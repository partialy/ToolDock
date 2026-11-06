import {z} from 'zod'

export const conversionDirectionSchema=z.enum(['simplify','traditional'])
export const conversionRegionSchema=z.enum(['general','tw','hk'])
export const conversionEncodingSchema=z.enum(['auto','utf8','gb18030','big5'])
export const conversionOutputEncodingSchema=z.enum(['preserve','utf8'])
export const conversionFormatSchema=z.enum(['txt','md','srt','vtt','lrc'])
export type ConversionFormat=z.infer<typeof conversionFormatSchema>
export const conversionPreferenceFields={
 direction:conversionDirectionSchema,region:conversionRegionSchema,phraseConversion:z.boolean(),
 suffix:z.string().max(64),inputEncoding:conversionEncodingSchema,outputEncoding:conversionOutputEncodingSchema
}
export const conversionPreferencesSchema=z.strictObject({
 direction:conversionPreferenceFields.direction.default('simplify'),
 region:conversionPreferenceFields.region.default('general'),
 phraseConversion:conversionPreferenceFields.phraseConversion.default(false),
 suffix:conversionPreferenceFields.suffix.default(''),
 inputEncoding:conversionPreferenceFields.inputEncoding.default('auto'),
 outputEncoding:conversionPreferenceFields.outputEncoding.default('preserve')
})
export const conversionPreferencesPatchSchema=z.strictObject(conversionPreferenceFields).partial()
export type ConversionPreferences=z.infer<typeof conversionPreferencesSchema>
export type ConversionEncoding=z.infer<typeof conversionEncodingSchema>
export type ConversionOutputEncoding=z.infer<typeof conversionOutputEncodingSchema>
export type ConversionState='ready'|'queued'|'running'|'completed'|'failed'|'cancelled'
export interface ConversionTask {
 id:string;name:string;inputPath:string;size:number;mtimeMs:number;state:ConversionState;
 percent:number;outputName:string;customName:boolean;encodingOverride?:ConversionEncoding;
 detectedEncoding?:string;outputBytes?:number;error:string;attempts:number;
 savedPaths:string[];createdAt:number;updatedAt:number
}
export interface ConversionSnapshot {tasks:ConversionTask[];preferences:ConversionPreferences;busy:boolean}
export interface ConversionAddResult {added:number;skipped:{path:string;reason:string}[]}
export interface ConversionSaveReport {saved:string[];failed:{name:string;reason:string}[];skipped:number}
export interface ConversionPreview {text:string;total:number;offset:number}
export interface TextConversionAPI {
 status():Promise<ConversionSnapshot>;chooseFiles():Promise<string[]>;chooseFolder():Promise<string|null>;
 addSources(paths:string[]):Promise<ConversionAddResult>;start(ids:string[],force?:boolean):Promise<void>;
 cancel(id:string):Promise<void>;remove(ids:string[]):Promise<void>;
 rename(id:string,name:string):Promise<void>;setEncoding(id:string,encoding:ConversionEncoding):Promise<void>;
 setPreferences(patch:Partial<ConversionPreferences>):Promise<void>;
 preview(id:string,side:'source'|'result',offset:number,length:number):Promise<ConversionPreview>;
 search(id:string,side:'source'|'result',query:string,from?:number):Promise<number>;
 saveOne(id:string):Promise<string|null>;saveSelected(ids:string[]):Promise<ConversionSaveReport|null>;
 saveZip(ids:string[]):Promise<string|null>;onChange(cb:()=>void):()=>void
}
