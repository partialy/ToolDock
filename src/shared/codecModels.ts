import {z} from 'zod'
export const codecKinds=['base64','url','unicode','hex','html-entity','json-escape','binary'] as const
export type CodecKind=typeof codecKinds[number]
export type CodecDirection='encode'|'decode'
export type CodecOptions={variant?:'standard'|'url'|'auto';padded?:boolean;mode?:'component'|'uri'|'form';format?:'js'|'es6'|'codepoint'|'compact'|'space'|'0x'|'slash-x'|'basic'|'decimal'|'hex';uppercase?:boolean}
export type CodecStep={id:string;kind:CodecKind;direction:CodecDirection;enabled:boolean;options:CodecOptions}
export type PipelineInput={name:string;description:string;steps:CodecStep[]}
export type PipelineSaved=PipelineInput&{id:string;revision:number;createdAt:string;updatedAt:string}
export type PipelineSummary=Omit<PipelineSaved,'steps'>&{stepCount:number}
export const MAX_INPUT_BYTES=2*1024*1024,MAX_STEP_BYTES=8*1024*1024,MAX_STEPS=20,MAX_CONFIG_BYTES=64*1024,MAX_SAVED=200
const options:Record<CodecKind,z.ZodTypeAny>={
 'base64':z.strictObject({variant:z.enum(['standard','url','auto']),padded:z.boolean()}),
 'url':z.strictObject({mode:z.enum(['component','uri','form'])}),
 'unicode':z.strictObject({format:z.enum(['js','es6','codepoint'])}),
 'hex':z.strictObject({format:z.enum(['compact','space','0x','slash-x']),uppercase:z.boolean()}),
 'html-entity':z.strictObject({format:z.enum(['basic','decimal','hex'])}),
 'json-escape':z.strictObject({}),
 'binary':z.strictObject({format:z.enum(['compact','space'])})
}
export const stepSchema=z.strictObject({id:z.uuid(),kind:z.enum(codecKinds),direction:z.enum(['encode','decode']),enabled:z.boolean(),options:z.record(z.string(),z.unknown())}).superRefine((s,ctx)=>{
 if(!options[s.kind].safeParse(s.options).success)ctx.addIssue({code:'custom',message:'该步骤参数与编码类型不匹配'})
 if(s.kind==='base64'&&s.direction==='encode'&&s.options.variant==='auto')ctx.addIssue({code:'custom',message:'自动识别仅用于 Base64 解码'})
})
export const pipelineInputSchema=z.strictObject({name:z.string().trim().min(1).max(80),description:z.string().max(500),steps:z.array(stepSchema).max(MAX_STEPS)}).superRefine((p,ctx)=>{
 const ids=p.steps.map(s=>s.id)
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:'custom',message:'步骤 ID 重复'})
 if(new TextEncoder().encode(JSON.stringify({schemaVersion:1,steps:p.steps,name:p.name,description:p.description})).length>MAX_CONFIG_BYTES)ctx.addIssue({code:'custom',message:'流程配置超过 64 KiB'})
})
export const pipelineExportSchema=z.strictObject({format:z.literal('tooldock.codec-pipeline'),version:z.literal(1),pipeline:pipelineInputSchema})
export const pipelineIdSchema=z.uuid()
export function makeStep(kind:CodecKind='base64',direction:CodecDirection='encode'):CodecStep{
 const defaults:Record<CodecKind,CodecOptions>={
  base64:{variant:direction==='decode'?'auto':'standard',padded:true},url:{mode:'component'},unicode:{format:'js'},hex:{format:'space',uppercase:true},
  'html-entity':{format:'basic'},'json-escape':{},binary:{format:'space'}
 }
 return {id:crypto.randomUUID(),kind,direction,enabled:true,options:{...defaults[kind]}}
}
export const kindLabels:Record<CodecKind,string>={base64:'Base64',url:'URL',unicode:'Unicode',hex:'Hex','html-entity':'HTML Entity','json-escape':'JSON Escape',binary:'Binary'}
export function assertTextScalar(text:string){
 for(let i=0;i<text.length;i++){const n=text.charCodeAt(i)
  if(n>=0xD800&&n<=0xDBFF){const next=text.charCodeAt(++i);if(!(next>=0xDC00&&next<=0xDFFF))throw Error('文本包含不完整的 Unicode 高代理项')}
  else if(n>=0xDC00&&n<=0xDFFF)throw Error('文本包含孤立的 Unicode 低代理项')
 }
}
