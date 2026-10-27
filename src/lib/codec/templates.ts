import {makeStep,type CodecKind,type CodecDirection,type CodecStep} from '../../shared/codecModels'
type Specification=[CodecKind,CodecDirection]
export const codecTemplates:{name:string;description:string;steps:Specification[]}[]=[
 {name:'URL → Base64',description:'URL 参数值编码，再编码 Base64',steps:[['url','encode'],['base64','encode']]},
 {name:'Base64 → URL 解码',description:'按顺序还原 Base64 与 URL 参数',steps:[['base64','decode'],['url','decode']]},
 {name:'JSON → URL',description:'转义为 JSON 字符串，再作 URL 编码',steps:[['json-escape','encode'],['url','encode']]},
 {name:'Unicode → Base64',description:'Unicode 转义，再 Base64 编码',steps:[['unicode','encode'],['base64','encode']]},
 {name:'Hex → Base64',description:'Hex 解码为合法 UTF-8，然后 Base64 编码',steps:[['hex','decode'],['base64','encode']]},
 {name:'Base64 → Hex',description:'Base64 解码为合法 UTF-8，然后 Hex 编码',steps:[['base64','decode'],['hex','encode']]}
]
export function instantiateTemplate(index:number):CodecStep[]{const item=codecTemplates[index];if(!item)throw Error('未知的流程模板');return item.steps.map(([kind,direction])=>makeStep(kind,direction))}
