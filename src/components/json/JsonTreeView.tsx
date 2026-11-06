import {msg} from '@/components/ui/message'
import {useEffect,useMemo,useRef,useState} from 'react'
import {useVirtualizer} from '@tanstack/react-virtual'
import {ChevronDown,ChevronRight,Copy,Search} from 'lucide-react'
import type {TreeNode,TreePage} from '@/hooks/useJsonWorker'
import {Input} from '@/components/ui/input'
import {Button} from '@/components/ui/button'
type Props={root:TreeNode|null;revision:number;getChildren:(id:string,start?:number)=>Promise<TreePage>;search:(q:string)=>Promise<{nodes:TreeNode[];total:number}>;getNode:(id:string,mode?:'raw'|'display')=>Promise<string>}
type TreeRow={node?:TreeNode;depth:number;more?:string}
export function JsonTreeView({root,revision,getChildren,search,getNode}:Props){
 const [expanded,setExpanded]=useState<Set<string>>(new Set(['$']))
 const [pages,setPages]=useState<Record<string,TreePage>>({})
 const [query,setQuery]=useState('')
 const [found,setFound]=useState<TreeNode[]>([])
 const [matchCount,setMatchCount]=useState(0)
 const [error,setError]=useState('')
 const [selected,setSelected]=useState('')
 const [context,setContext]=useState<{id:string;path:string;x:number;y:number}|null>(null)
 const scroll=useRef<HTMLDivElement>(null)
 useEffect(()=>{setPages({});setExpanded(new Set(['$']));setQuery('');setFound([]);setError('');if(root&&root.count)getChildren('$').then(p=>setPages({'$':p})).catch(e=>setError(String(e)))},[root,revision,getChildren])
 useEffect(()=>{
  if(!query.trim()){setFound([]);setMatchCount(0);return}
  let active=true
  const token=setTimeout(()=>{search(query).then(v=>{if(active){setFound(v.nodes);setMatchCount(v.total)}}).catch(e=>{if(active)setError(String(e))})},240)
  return()=>{active=false;clearTimeout(token)}
 },[query,search,revision])
 const rows=useMemo(()=>{
  if(!root)return [] as TreeRow[]
  const output:TreeRow[]=[]
  const walk=(node:TreeNode,depth:number)=>{
   output.push({node,depth})
   if(!expanded.has(node.id))return
   const entry=pages[node.id]
   if(!entry)return
   for(const child of entry.nodes)walk(child,depth+1)
   if(entry.nodes.length<entry.total)output.push({more:node.id,depth:depth+1})
  }
  if(query.trim()){
   for(const node of found)output.push({node,depth:0})
  }else walk(root,0)
  return output
 },[root,expanded,pages,found,query])
 const virt=useVirtualizer({count:rows.length,getScrollElement:()=>scroll.current,estimateSize:()=>38,overscan:12})
 const load=async(id:string,start=0)=>{
  try{
   const page=await getChildren(id,start)
   setPages(prev=>({...prev,[id]:{total:page.total,nodes:start?[...(prev[id]?.nodes||[]),...page.nodes]:page.nodes}}))
  }catch(e){setError(e instanceof Error?e.message:String(e))}
 }
 const toggle=(node:TreeNode)=>{
  if(!node.count)return
  const yes=expanded.has(node.id)
  setExpanded(prev=>{const next=new Set(prev);if(yes)next.delete(node.id);else next.add(node.id);return next})
  if(!yes&&!pages[node.id])void load(node.id)
 }
 const reveal=async(node:TreeNode)=>{
  setSelected(node.id)
  if(!query.trim())return
  const steps=node.id.split('/')
  const ids=steps.map((_,i)=>steps.slice(0,i+1).join('/'))
  for(const id of ids.slice(0,-1))await load(id)
  setExpanded(new Set(ids))
  setQuery('')
 }
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);msg.success('已复制')}catch{msg.error('复制失败')}}
 return <div className="space-y-2">
  <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 muted" size={15}/><Input className="pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索 Key、Value 或 JSONPath..."/></div>
  {!!query&&<p className="text-xs muted">搜索到 {matchCount} 项，展示前 {found.length} 项；点击可定位树节点</p>}
  <div ref={scroll} role="tree" aria-label="JSON 树形结构" className="h-[420px] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--panel-alt)]">
   <div className="relative w-full" style={{height:virt.getTotalSize()}}>
    {virt.getVirtualItems().map(v=>{
     const row=rows[v.index]
     return <div key={v.key} onContextMenu={e=>{if(row.node){e.preventDefault();setContext({id:row.node.id,path:row.node.path,x:e.clientX,y:e.clientY})}}} className="absolute left-0 top-0 flex h-[38px] w-full items-center gap-1 border-b border-[var(--border)]/25 pr-2 text-xs hover:bg-[var(--hover)]" style={{transform:`translateY(${v.start}px)`,paddingLeft:8+row.depth*18}}>
      {row.more?<Button variant="ghost" size="sm" onClick={()=>void load(row.more!,pages[row.more!]?.nodes.length||0)}>加载更多…</Button>:row.node&&<>
       <button type="button" className="flex h-7 w-6 shrink-0 items-center justify-center" disabled={!row.node.count} onClick={()=>query?void reveal(row.node!):toggle(row.node!)} aria-label={expanded.has(row.node.id)?'折叠节点':'展开节点'}>
        {row.node.count?(expanded.has(row.node.id)?<ChevronDown size={14}/>:<ChevronRight size={14}/>):<span className="w-3"/>}
       </button>
       <button type="button" className={'min-w-0 flex-1 truncate text-left '+(selected===row.node.id?'text-[var(--primary)]':'')} title={row.node.path+' · '+row.node.preview} onClick={()=>query?void reveal(row.node!):toggle(row.node!)}>
        <span className="font-medium">{row.node.key}</span> <span className="muted">{row.node.type==='object'?'{…}':row.node.type==='array'?'[…]':row.node.preview}</span>
       </button>
       <button type="button" className="shrink-0 rounded p-1 muted hover:text-[var(--primary)]" title="复制 JSONPath" aria-label="复制 JSONPath" onClick={()=>void copy(row.node!.path)}><Copy size={13}/></button>
       <button type="button" className="shrink-0 rounded p-1 muted hover:text-[var(--primary)]" title="复制节点 JSON" aria-label="复制节点 JSON" onClick={()=>void getNode(row.node!.id).then(copy).catch(e=>setError(String(e)))}><Copy size={13}/></button>
      </>}
     </div>
    })}
   </div>
   {!root&&<p className="p-6 text-center text-xs muted">输入有效 JSON 后显示树形结构</p>}
  </div>
  {context&&<><div className="fixed inset-0 z-[230]" onClick={()=>setContext(null)}/><div role="menu" className="fixed z-[240] min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5 text-xs shadow-xl" style={{left:Math.min(context.x,window.innerWidth-190),top:Math.min(context.y,window.innerHeight-146)}}>
   <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--hover)]" onClick={()=>{void copy(context.path);setContext(null)}}>复制 JSONPath</button>
   <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--hover)]" onClick={()=>{void getNode(context.id,'display').then(copy).catch(e=>setError(String(e)));setContext(null)}}>复制节点值</button>
   <button role="menuitem" className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--hover)]" onClick={()=>{void getNode(context.id,'raw').then(copy).catch(e=>setError(String(e)));setContext(null)}}>复制节点 JSON</button>
  </div></>}
  {error&&<p role="alert" className="text-xs text-red-400">{error}</p>}
 </div>
}
