import type {JsonDiagnostic} from '@/lib/json/parse'
import {jsonLineCol} from '@/lib/json/parse'
export function JsonDiagnostics({text,errors,duplicates}:{text:string;errors:JsonDiagnostic[];duplicates:JsonDiagnostic[]}){
 const items=[...errors,...duplicates]
 if(!items.length)return <p className="text-xs text-emerald-400">JSON 语法检查通过</p>
 return <div className="max-h-32 space-y-1 overflow-y-auto text-xs" role="status">
  {items.slice(0,40).map((item,i)=>{
   const p=jsonLineCol(text,item.from)
   return <div key={i} className={item.severity==='error'?'text-red-400':'text-amber-400'}>
    {p.line}:{p.column} · {item.message}{item.firstFrom!==undefined&&(()=>{const first=jsonLineCol(text,item.firstFrom!);return '（首次位于 '+first.line+':'+first.column+'）'})()}
   </div>
  })}
  {items.length>40&&<div className="muted">另有 {items.length-40} 条诊断</div>}
 </div>
}
