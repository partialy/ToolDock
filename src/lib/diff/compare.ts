import {parseStrictJson,jsonLineCol} from '../json/parse'
import {transformJson} from '../json/transform'

export type DiffMode='text'|'json'
export type DiffKind='equal'|'added'|'removed'|'modified'
export type DiffRow={kind:DiffKind;leftNumber:number|null;rightNumber:number|null;leftText:string;rightText:string}
export type DiffBlock={start:number;end:number}
export type DiffResult={leftDisplay:string;rightDisplay:string;rows:DiffRow[];blocks:DiffBlock[];added:number;removed:number;modified:number;isNormalized:boolean}

export const DIFF_MAX_BYTES=2*1024*1024
export const DIFF_MAX_LINES=10000
const MAX_EDIT_DISTANCE=300
type Op={kind:'equal'|'insert'|'delete';text:string}

function validateInput(value:string,side:string){
 if(new TextEncoder().encode(value).byteLength>DIFF_MAX_BYTES)throw Error(side+'文本超过 2 MiB 比较上限')
}

function normalizedJson(value:string,side:string,ignoreKeyOrder:boolean){
 const parsed=parseStrictJson(value)
 if(!parsed.valid){
  const first=parsed.diagnostics[0]
  if(first){
   const {line,column}=jsonLineCol(value,first.from)
   throw Error(side+' JSON 语法错误：第 '+line+' 行，第 '+column+' 列，'+first.message)
  }
  throw Error(side+' JSON 为空或无效')
 }
 if(parsed.duplicateKeys.length){
  const item=parsed.duplicateKeys[0]
  const {line,column}=jsonLineCol(value,item.from)
  throw Error(side+' JSON 第 '+line+' 行，第 '+column+' 列存在'+item.message+'，无法安全比较')
 }
 return transformJson(value,ignoreKeyOrder?'sort':'format','2')
}

function middleDiff(a:string[],b:string[]):Op[]{
 if(!a.length)return b.map(text=>({kind:'insert',text}))
 if(!b.length)return a.map(text=>({kind:'delete',text}))
 let v=new Map<number,number>([[1,0]])
 const trace:Map<number,number>[]=[]
 for(let d=0;d<=Math.min(a.length+b.length,MAX_EDIT_DISTANCE);d++){
  trace.push(new Map(v))
  for(let k=-d;k<=d;k+=2){
   const down=k===-d||(k!==d&&(v.get(k-1)??-1)<(v.get(k+1)??-1))
   let x=down?(v.get(k+1)??0):(v.get(k-1)??0)+1
   let y=x-k
   while(x<a.length&&y<b.length&&a[x]===b[y]){x++;y++}
   v.set(k,x)
   if(x>=a.length&&y>=b.length){
    const result:Op[]=[]
    let endX=a.length,endY=b.length
    for(let depth=d;depth>=0;depth--){
     const previous=trace[depth],diagonal=endX-endY
     const cameDown=diagonal===-depth||(diagonal!==depth&&(previous.get(diagonal-1)??-1)<(previous.get(diagonal+1)??-1))
     const prevK=cameDown?diagonal+1:diagonal-1
     const prevX=previous.get(prevK)??0,prevY=prevX-prevK
     while(endX>prevX&&endY>prevY){
      result.push({kind:'equal',text:a[endX-1]});endX--;endY--
     }
     if(depth===0)break
     if(cameDown){result.push({kind:'insert',text:b[endY-1]});endY--}
     else{result.push({kind:'delete',text:a[endX-1]});endX--}
    }
    return result.reverse()
   }
  }
 }
 // Guard against quadratic behavior for largely unrelated files.
 // The entire unmatched middle is displayed as one accurate change block.
 return [...a.map(text=>({kind:'delete' as const,text})),...b.map(text=>({kind:'insert' as const,text}))]
}

function diffOps(a:string[],b:string[]):Op[]{
 let prefix=0
 while(prefix<a.length&&prefix<b.length&&a[prefix]===b[prefix])prefix++
 let suffix=0
 while(suffix<a.length-prefix&&suffix<b.length-prefix&&a[a.length-1-suffix]===b[b.length-1-suffix])suffix++
 return [
  ...a.slice(0,prefix).map(text=>({kind:'equal' as const,text})),
  ...middleDiff(a.slice(prefix,a.length-suffix),b.slice(prefix,b.length-suffix)),
  ...a.slice(a.length-suffix).map(text=>({kind:'equal' as const,text}))
 ]
}

export function compareDocuments(left:string,right:string,mode:DiffMode,ignoreKeyOrder=false):DiffResult{
 validateInput(left,'左侧')
 validateInput(right,'右侧')
 const isNormalized=mode==='json'
 const leftDisplay=isNormalized?normalizedJson(left,'左侧',ignoreKeyOrder):left.replace(/\r\n?|\n/g,'\n')
 const rightDisplay=isNormalized?normalizedJson(right,'右侧',ignoreKeyOrder):right.replace(/\r\n?|\n/g,'\n')
 const a=leftDisplay.split('\n'),b=rightDisplay.split('\n')
 if(a.length>DIFF_MAX_LINES||b.length>DIFF_MAX_LINES)throw Error('单侧超过 10000 行，已停止比较，请缩小内容范围')
 const ops=diffOps(a,b),rows:DiffRow[]=[],blocks:DiffBlock[]=[]
 let leftNumber=1,rightNumber=1,added=0,removed=0,modified=0
 for(let i=0;i<ops.length;){
  if(ops[i].kind==='equal'){
   rows.push({kind:'equal',leftNumber:leftNumber++,rightNumber:rightNumber++,leftText:ops[i].text,rightText:ops[i].text})
   i++;continue
  }
  const deletes:string[]=[],inserts:string[]=[]
  while(i<ops.length&&ops[i].kind!=='equal'){
   if(ops[i].kind==='delete')deletes.push(ops[i].text)
   else inserts.push(ops[i].text)
   i++
  }
  const start=rows.length
  for(let j=0;j<Math.max(deletes.length,inserts.length);j++){
   const hasLeft=j<deletes.length,hasRight=j<inserts.length
   const kind:DiffKind=hasLeft&&hasRight?'modified':hasLeft?'removed':'added'
   rows.push({kind,leftNumber:hasLeft?leftNumber++:null,rightNumber:hasRight?rightNumber++:null,leftText:hasLeft?deletes[j]:'',rightText:hasRight?inserts[j]:''})
   if(kind==='modified')modified++;else if(kind==='added')added++;else removed++
  }
  blocks.push({start,end:rows.length-1})
 }
 return {leftDisplay,rightDisplay,rows,blocks,added,removed,modified,isNormalized}
}
