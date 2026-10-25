import {parseTree,printParseErrorCode,type Node as JsonNode,type ParseError} from 'jsonc-parser'

export type JsonDiagnostic={from:number;to:number;message:string;severity:'error'|'warning';firstFrom?:number}
const translateError=(code:string)=>({InvalidSymbol:'非法符号',InvalidNumberFormat:'数字格式无效',PropertyNameExpected:'缺少合法的属性名',ValueExpected:'缺少 JSON 值',ColonExpected:'缺少冒号',CommaExpected:'缺少逗号',CloseBraceExpected:'缺少结束大括号',CloseBracketExpected:'缺少结束中括号',EndOfFileExpected:'JSON 后存在多余内容',InvalidCommentToken:'不允许 JSON 注释',UnexpectedEndOfComment:'注释未结束',UnexpectedEndOfString:'字符串未结束',InvalidEscapeCharacter:'无效字符串转义',InvalidUnicode:'Unicode 转义格式无效'} as Record<string,string>)[code]||code
export type JsonParsed={root:JsonNode|null;diagnostics:JsonDiagnostic[];duplicateKeys:JsonDiagnostic[];valid:boolean;nodeCount:number}
const MAX_NODES=300000
export function jsonLineCol(text:string,offset:number){
 const before=text.slice(0,offset),parts=before.split(/\r\n|\n|\r/)
 return {line:parts.length,column:parts.at(-1)!.length+1}
}
export function parseStrictJson(text:string):JsonParsed {
 if(!text.trim())return {root:null,diagnostics:[],duplicateKeys:[],valid:false,nodeCount:0}
 const errors:ParseError[]=[]
 const root=parseTree(text,errors,{allowTrailingComma:false,disallowComments:true,allowEmptyContent:false})||null
 const diagnostics:JsonDiagnostic[]=errors.map(e=>({
  from:e.offset,to:e.offset+Math.max(1,e.length),message:translateError(printParseErrorCode(e.error)),severity:'error'
 }))
 const duplicateKeys:JsonDiagnostic[]=[]
 let nodeCount=0
 if(root){
  const stack=[root]
  while(stack.length){
   const node=stack.pop()!
   if(++nodeCount>MAX_NODES){diagnostics.push({from:0,to:1,message:'JSON 节点数量超过安全上限',severity:'error'});break}
   if(node.type==='object'){
    const seen=new Map<string,JsonNode>()
    for(const prop of node.children||[]){
     const key=prop.children?.[0]
     if(!key)continue
     const name=String(key.value)
     if(seen.has(name)){
      duplicateKeys.push({from:key.offset,to:key.offset+key.length,message:'重复 Key：'+name,severity:'warning',firstFrom:seen.get(name)!.offset})
     }else seen.set(name,key)
    }
   }
   if(node.children)for(const child of node.children)stack.push(child)
  }
 }
 return {root,diagnostics,duplicateKeys,valid:!!root&&!diagnostics.length,nodeCount}
}
export type {JsonNode}
