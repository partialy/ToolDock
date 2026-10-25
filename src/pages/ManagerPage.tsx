import { useState } from 'react'
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, KeyboardSensor, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Pencil, Trash2, FolderPlus, Plus, RotateCcw } from 'lucide-react'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import type {Workspace} from '@/store/useWorkspace'
import type {Category,Tool} from '@/types/models'
type Edit=({kind:'category';item?:Category}|{kind:'tool';item?:Tool})
function SortableRow({id,children}:{id:string;children:(handle:Record<string,unknown>)=>React.ReactNode}){
 const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id})
 return <div ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition,zIndex:isDragging?5:0,position:'relative'}} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2">{children({...attributes,...listeners})}</div>
}
export function ManagerPage({ws,onEdit}:{ws:Workspace;onEdit:(edit:Edit)=>void}){
 const [tab,setTab]=useState('categories')
 const [categoryId,setCategoryId]=useState('default')
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}))
 const ordered=ws.categories
 const tools=ws.tools.filter(x=>x.categoryId===categoryId)
 const sortCats=async(event:DragEndEvent)=>{
  const {active,over}=event;if(!over||active.id===over.id)return
  const a=ordered.findIndex(c=>c.id===active.id),b=ordered.findIndex(c=>c.id===over.id)
  if(a<0||b<0)return
  await ws.execute(()=>window.toolDock.categories.reorder(arrayMove(ordered,a,b).map(x=>x.id)))
 }
 const sortTools=async(event:DragEndEvent)=>{
  const {active,over}=event;if(!over||active.id===over.id)return
  const a=tools.findIndex(c=>c.id===active.id),b=tools.findIndex(c=>c.id===over.id)
  if(a<0||b<0)return
  await ws.execute(()=>window.toolDock.tools.reorder(categoryId,arrayMove(tools,a,b).map(x=>x.id)))
 }
 const setVisible=async(t:Tool|Category,category:boolean)=>{await ws.execute(()=>category?window.toolDock.categories.save({...t,name:t.name,visible:!t.visible} as Category):window.toolDock.tools.save({...t,name:t.name,visible:!t.visible} as Tool))}
 const remove=async(t:Tool|Category,category:boolean)=>{
  if(category&&t.id==='default')return
  const msg=category?'删除分类「'+t.name+'」？分类中的工具将自动移至默认分类。':'删除工具「'+t.name+'」？'
  if(!window.confirm(msg))return
  await ws.execute(()=>category?window.toolDock.categories.remove(t.id):window.toolDock.tools.remove(t.id))
 }
 const actions=(t:Tool|Category,category:boolean)=><div className="ml-auto flex shrink-0 items-center gap-1">
  <Button variant="ghost" size="icon" title={t.visible?'隐藏':'显示'} onClick={()=>void setVisible(t,category)}>{t.visible?<Eye size={15}/>:<EyeOff size={15}/>}</Button>
  <Button variant="ghost" size="icon" title="编辑" onClick={()=>onEdit(category?{kind:'category',item:t as Category}:{kind:'tool',item:t as Tool})}><Pencil size={15}/></Button>
  {!category&&(t as Tool).type==='link'&&<Button variant="ghost" size="icon" title="清除网页 Cookie 和缓存" onClick={()=>{if(window.confirm('清除「'+t.name+'」的网站登录状态与缓存？'))void ws.execute(()=>window.toolDock.views.clearData(t.id))}}><RotateCcw size={15}/></Button>}
  {(!category?t.id!=='builtin-key-generator':t.id!=='default')&&<Button variant="danger" size="icon" title="删除" onClick={()=>void remove(t,category)}><Trash2 size={15}/></Button>}
 </div>
 return <div className="mx-auto max-w-5xl space-y-5 p-7">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-2xl font-semibold">工具管理</h1><p className="mt-2 text-sm muted">分类与工具的编辑、显隐、排序都在这里。拖动左侧把手可调整顺序。</p></div>
   <Button variant="primary" size="sm" onClick={()=>onEdit(tab==='categories'?{kind:'category'}:{kind:'tool'})}><Plus size={16}/> {tab==='categories'?'新增分类':'新增工具'}</Button>
  </div>
  <div className="inline-flex rounded-xl bg-[var(--panel-alt)] p-1">
   {([['categories','分类管理'],['tools','工具管理']] as const).map(([key,label])=><button key={key} className={'rounded-lg px-4 py-2 text-sm '+(tab===key?'bg-[var(--panel)] shadow':'muted')} onClick={()=>setTab(key)}>{label}</button>)}
  </div>
  {tab==='tools'&&<select className="ml-3 h-9 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3" value={categoryId} onChange={e=>setCategoryId(e.target.value)}>{ws.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
  {tab==='categories'?<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e=>void sortCats(e)}>
   <SortableContext items={ordered.map(c=>c.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{ordered.map(c=><SortableRow key={c.id} id={c.id}>{handle=><>
    <button {...handle} aria-label="拖拽分类" className="touch-none cursor-grab p-1 muted"><GripVertical size={17}/></button>
    <Icon name={c.icon}/><span className="font-medium">{c.name}</span>{c.id==='default'&&<span className="rounded bg-[var(--panel-alt)] px-2 text-[10px] muted">系统默认</span>}
    <span className="text-xs muted">· {ws.tools.filter(t=>t.categoryId===c.id).length} 个工具</span>{!c.visible&&<span className="text-xs text-amber-400">已隐藏</span>}{actions(c,true)}
   </>}</SortableRow>)}</div></SortableContext>
  </DndContext>:<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e=>void sortTools(e)}>
   <SortableContext items={tools.map(t=>t.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{tools.map(t=><SortableRow key={t.id} id={t.id}>{handle=><>
    <button {...handle} aria-label="拖拽工具" className="touch-none cursor-grab p-1 muted"><GripVertical size={17}/></button>
    <Icon name={t.icon}/><span className="font-medium">{t.name}</span><span className="truncate text-xs muted">{t.type==='internal'?'内部页面':t.target}</span>
    {!t.visible&&<span className="text-xs text-amber-400">已隐藏</span>}{actions(t,false)}
   </>}</SortableRow>)}{tools.length===0&&<p className="py-16 text-center muted">这个分类还没有工具</p>}</div></SortableContext>
  </DndContext>}
 </div>
}
