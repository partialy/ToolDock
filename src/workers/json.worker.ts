/// <reference lib="webworker" />
import {parseStrictJson,type JsonNode} from '../lib/json/parse'
import {transformJson,type JsonAction,type JsonIndent} from '../lib/json/transform'
import {childJsonPath} from '../lib/json/paths'

type Request={id:number;revision:number;kind:'parse'|'transform'|'children'|'search'|'node';source?:string;action?:JsonAction;indent?:JsonIndent;nodeId?:string;start?:number;query?:string;valueKind?:'raw'|'display'}
type Meta={id:string;path:string;key:string;type:string;preview:string;count:number}
let revision=0,source='',root:JsonNode|null=null
const map=new Map<string,{node:JsonNode;path:string}>()
const getItems=(parentId:string,start:number,limit:number)=>{
 const current=map.get(parentId)
 if(!current)return {nodes:[] as Meta[],total:0}
 const entries=current.node.children||[]
 const nodes=entries.slice(start,start+limit).map((entry,index)=>{
  const pos=start+index
  const property=entry.type==='property'
  const key=property?String(entry.children?.[0]?.value):String(pos)
  const value=property?entry.children?.[1]:entry
  if(!value)return null
  const path=childJsonPath(current.path,property?key:pos)
  const id=parentId+'/'+value.offset
  map.set(id,{node:value,path})
  return {id,path,key,type:value.type,preview:source.slice(value.offset,value.offset+Math.min(value.length,150)),
    count:value.children?.length||0}
 }).filter(v=>v!==null) as Meta[]
 return {nodes,total:entries.length}
}
function searchTree(query:string){
 if(!root||!query.trim())return {nodes:[] as Meta[],total:0}
 const q=query.toLowerCase(),results:Meta[]=[]
 const queue:[JsonNode,string,string,string][]=[[root,'$','$','$']]
 let total=0,visited=0
 while(queue.length&&visited<300000){
  const [node,p,key,id]=queue.pop()!
  visited++
  const value=source.slice(node.offset,node.offset+Math.min(node.length,150))
  const searchable=(node.type==='object'||node.type==='array')?'':source.slice(node.offset,node.offset+node.length)
  if(key.toLowerCase().includes(q)||p.toLowerCase().includes(q)||searchable.toLowerCase().includes(q)){
    total++; if(results.length<200)results.push({id,path:p,key,type:node.type,preview:value,count:node.children?.length||0})
  }
  const children=node.children||[]
  for(let i=children.length-1;i>=0;i--){
   const entry=children[i]
   const prop=entry.type==='property'
   const name=prop?String(entry.children?.[0]?.value):String(i)
   const n=prop?entry.children?.[1]:entry
   if(!n)continue
   const cp=childJsonPath(p,prop?name:i),cid=id+'/'+n.offset
   map.set(cid,{node:n,path:cp})
   queue.push([n,cp,name,cid])
  }
 }
 return {nodes:results,total}
}
self.onmessage=(ev:MessageEvent<Request>)=>{
 const msg=ev.data
 const respond=(data:unknown)=>self.postMessage({id:msg.id,revision:msg.revision,ok:true,data})
 const reject=(err:unknown)=>self.postMessage({id:msg.id,revision:msg.revision,ok:false,error:err instanceof Error?err.message:String(err)})
 try{
  if(msg.kind==='parse'){
   source=msg.source||'';revision=msg.revision;map.clear()
   const p=parseStrictJson(source);root=p.valid?p.root:null
   if(root)map.set('$',{node:root,path:'$'})
   respond({valid:p.valid,diagnostics:p.diagnostics,duplicates:p.duplicateKeys,nodeCount:p.nodeCount,
     root:root?{id:'$',path:'$',key:'$',type:root.type,preview:source.slice(0,Math.min(root.length,150)),count:root.children?.length||0}:null})
   return
  }
  if(msg.kind==='transform'){
   if(msg.action==='escape'||msg.action==='unescape')respond(transformJson(msg.source||'',msg.action,msg.indent))
   else if(msg.revision!==revision)throw Error('源内容已更新，请重新处理')
   else respond(transformJson(source,msg.action!,msg.indent))
   return
  }
  if(msg.revision!==revision)throw Error('内容版本已过期')
  if(msg.kind==='children')respond(getItems(msg.nodeId||'$',Math.max(0,msg.start||0),200))
  if(msg.kind==='node'){
   const item=map.get(msg.nodeId||'$')
   if(!item)throw Error('节点已过期，请重新展开')
   respond(msg.valueKind==='display'&&item.node.type==='string'?String(item.node.value):source.slice(item.node.offset,item.node.offset+item.node.length))
  }
  if(msg.kind==='search')respond(searchTree(msg.query||''))
 }catch(err){reject(err)}
}
export {}
