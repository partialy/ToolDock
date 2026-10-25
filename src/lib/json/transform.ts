import {parseStrictJson,type JsonNode} from './parse'

export type JsonAction='format'|'compact'|'sort'|'escape'|'unescape'
export type JsonIndent='2'|'4'|'tab'
function compareUnicode(a:string,b:string){
 const aa=Array.from(a),bb=Array.from(b)
 for(let i=0;i<Math.min(aa.length,bb.length);i++){
  const d=aa[i].codePointAt(0)!-bb[i].codePointAt(0)!
  if(d)return d
 }
 return aa.length-bb.length
}
export function transformJson(source:string,action:JsonAction,indent:JsonIndent='2'):string{
 if(action==='escape')return JSON.stringify(source)
 if(action==='unescape'){
  const parsed=parseStrictJson(source)
  if(!parsed.valid||parsed.root?.type!=='string')throw Error('反转义输入必须是合法 JSON 字符串字面量')
  return JSON.parse(source) as string
 }
 const parsed=parseStrictJson(source)
 if(!parsed.valid||!parsed.root)throw Error('JSON 语法无效，不能执行转换')
 if(parsed.duplicateKeys.length)throw Error('发现重复 Key，已阻止可能改变数据的操作')
 const unit=indent==='tab'?'\t':' '.repeat(Number(indent))
 const pretty=action!=='compact'
 const walk=(node:JsonNode,depth:number):string=>{
  if(depth>2000)throw Error('JSON 层级过深')
  if(node.type!=='object'&&node.type!=='array')return source.slice(node.offset,node.offset+node.length)
  const original=node.children||[]
  if(!original.length)return node.type==='object'?'{}':'[]'
  const children=node.type==='object' && action==='sort'
   ?[...original].sort((x,y)=>compareUnicode(String(x.children?.[0]?.value),String(y.children?.[0]?.value)))
   :original
  const pad=pretty?'\n'+unit.repeat(depth+1):''
  const endPad=pretty?'\n'+unit.repeat(depth):''
  const sep=pretty?',\n'+unit.repeat(depth+1):','
  const parts=children.map(child=>{
   if(node.type==='array')return walk(child,depth+1)
   const key=child.children?.[0],value=child.children?.[1]
   if(!key||!value)throw Error('无效对象属性')
   return source.slice(key.offset,key.offset+key.length)+(pretty?': ':':')+walk(value,depth+1)
  })
  const [open,close]=node.type==='object'?['{','}']:['[',']']
  return open+pad+parts.join(sep)+endPad+close
 }
 return walk(parsed.root,0)
}
