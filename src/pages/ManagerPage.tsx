import {useMemo,useState} from 'react'
import {DndContext,closestCenter,useSensor,useSensors,PointerSensor,KeyboardSensor,type DragEndEvent} from '@dnd-kit/core'
import {SortableContext,useSortable,sortableKeyboardCoordinates,verticalListSortingStrategy,arrayMove} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {Eye,EyeOff,GripVertical,Pencil,Trash2,Plus,RotateCcw,Pin,PinOff} from 'lucide-react'
import {Icon} from '@/components/ui/icon'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {DialogShell} from '@/components/ui/dialog-shell'
import {useDialog} from '@/components/ui/dialog-provider'
import {msg} from '@/components/ui/message'
import type {Workspace} from '@/store/useWorkspace'
import type {Category,Tool} from '@/types/models'

type Edit={kind:'category';item?:Category}|{kind:'tool';item?:Tool}
const rowClass='flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2'
function SortableRow({id,children}:{id:string;children:(handle:Record<string,unknown>)=>React.ReactNode}){
 const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id})
 return <div ref={setNodeRef} style={{transform:CSS.Transform.toString(transform),transition,zIndex:isDragging?5:0,position:'relative'}} className={rowClass}>{children({...attributes,...listeners})}</div>
}
export function ManagerPage({ws,onEdit}:{ws:Workspace;onEdit:(edit:Edit)=>void}){
 const dialog=useDialog()
 const [tab,setTab]=useState<'categories'|'tools'>('categories')
 const [categoryId,setCategoryId]=useState('all')
 const [pinsOpen,setPinsOpen]=useState(false)
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}))
 const ordered=useMemo(()=>[...ws.categories].sort((a,b)=>a.sortOrder-b.sortOrder),[ws.categories])
 const tools=useMemo(()=>ws.tools.filter(t=>categoryId==='all'||t.categoryId===categoryId).sort((a,b)=>{
  const ca=ordered.findIndex(c=>c.id===a.categoryId),cb=ordered.findIndex(c=>c.id===b.categoryId)
  return ca-cb||a.sortOrder-b.sortOrder||a.id.localeCompare(b.id)
 }),[ws.tools,categoryId,ordered])
 const pinned=useMemo(()=>ws.tools.filter(t=>t.trayPinOrder!=null).sort((a,b)=>(a.trayPinOrder??0)-(b.trayPinOrder??0)),[ws.tools])
 const categoryById=useMemo(()=>new Map(ws.categories.map(c=>[c.id,c])),[ws.categories])
 const execute=async(action:()=>Promise<unknown>)=>{try{await ws.execute(action)}catch{/* App 统一展示 workspace 错误 */}}
 const sortCats=async({active,over}:DragEndEvent)=>{
  if(!over||active.id===over.id)return
  const a=ordered.findIndex(c=>c.id===active.id),b=ordered.findIndex(c=>c.id===over.id)
  if(a>=0&&b>=0)await execute(()=>window.toolDock.categories.reorder(arrayMove(ordered,a,b).map(x=>x.id)))
 }
 const sortTools=async({active,over}:DragEndEvent)=>{
  if(categoryId==='all'||!over||active.id===over.id)return
  const a=tools.findIndex(c=>c.id===active.id),b=tools.findIndex(c=>c.id===over.id)
  if(a>=0&&b>=0)await execute(()=>window.toolDock.tools.reorder(categoryId,arrayMove(tools,a,b).map(x=>x.id)))
 }
 const sortPins=async({active,over}:DragEndEvent)=>{
  if(!over||active.id===over.id)return
  const a=pinned.findIndex(t=>t.id===active.id),b=pinned.findIndex(t=>t.id===over.id)
  if(a>=0&&b>=0)await execute(()=>window.toolDock.tools.reorderPins(arrayMove(pinned,a,b).map(t=>t.id)))
 }
 const setVisible=(t:Tool|Category,category:boolean)=>execute(()=>category?window.toolDock.categories.save({...t,visible:!t.visible} as Category):window.toolDock.tools.save({...t,visible:!t.visible} as Tool))
 const togglePin=(t:Tool)=>{if(t.trayPinOrder==null&&pinned.length>=6){msg.warning('最多固定 6 个工具，请先取消一个');return}void execute(()=>window.toolDock.tools.pin(t.id,t.trayPinOrder==null))}
 const remove=async(t:Tool|Category,category:boolean)=>{
  if(category&&t.id==='default')return
  await dialog.confirmAction({title:category?'删除分类':'删除工具',description:category?'删除分类「'+t.name+'」？分类中的工具将自动移至默认分类。':'删除工具「'+t.name+'」？',variant:'danger',confirmText:'确认删除',onConfirm:async()=>{await ws.execute(()=>category?window.toolDock.categories.remove(t.id):window.toolDock.tools.remove(t.id))}})
 }
 const actions=(t:Tool|Category,category:boolean)=><div className="ml-auto flex shrink-0 items-center gap-1">
  {!category&&<Button variant="ghost" size="icon" className={(t as Tool).trayPinOrder!=null?'text-indigo-400':''} title={(t as Tool).trayPinOrder!=null?'从托盘取消固定':'固定到托盘'} aria-label={(t as Tool).trayPinOrder!=null?'取消固定 '+t.name:'固定 '+t.name} onClick={()=>togglePin(t as Tool)}><Pin size={15} fill={(t as Tool).trayPinOrder!=null?'currentColor':'none'}/></Button>}
  <Button variant="ghost" size="icon" title={t.visible?'隐藏':'显示'} onClick={()=>void setVisible(t,category)}>{t.visible?<Eye size={15}/>:<EyeOff size={15}/>}</Button>
  <Button variant="ghost" size="icon" title="编辑" onClick={()=>onEdit(category?{kind:'category',item:t as Category}:{kind:'tool',item:t as Tool})}><Pencil size={15}/></Button>
  {!category&&(t as Tool).type==='link'&&<Button variant="ghost" size="icon" title="清除网页 Cookie 和缓存" onClick={()=>void dialog.confirmAction({title:'清理网页缓存',description:'清除「'+t.name+'」的网站登录状态、Cookie 和缓存？',variant:'warning',confirmText:'确认清理',onConfirm:async()=>{await ws.execute(()=>window.toolDock.views.clearData(t.id))}})}><RotateCcw size={15}/></Button>}
  {(!category?!(t as Tool).isBuiltin:t.id!=='default')&&<Button variant="danger" size="icon" title="删除" onClick={()=>void remove(t,category)}><Trash2 size={15}/></Button>}
 </div>
 const toolRow=(t:Tool,handle?:Record<string,unknown>)=><>
  {handle?<button {...handle} aria-label={'拖拽 '+t.name} className="touch-none cursor-grab p-1 muted"><GripVertical size={17}/></button>:<span className="w-[25px] shrink-0"/>}
  <Icon name={t.icon}/><span className="min-w-0 truncate font-medium">{t.name}</span>
  <span className="min-w-0 truncate text-xs muted">{t.type==='internal'?'内部页面':t.target}</span>
  {categoryId==='all'&&<span className="shrink-0 rounded bg-[var(--panel-alt)] px-2 py-1 text-[11px] muted">{categoryById.get(t.categoryId)?.name||'未知分类'}</span>}
  {(!t.visible||!categoryById.get(t.categoryId)?.visible)&&<span className="shrink-0 text-xs text-amber-400">已隐藏</span>}
  {actions(t,false)}
 </>
 return <div className="mx-auto max-w-5xl space-y-5 p-7">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-2xl font-semibold">工具管理</h1><p className="mt-2 text-sm muted">管理分类、工具及托盘快捷入口。仅具体分类内支持拖动工具排序。</p></div>
   <div className="flex items-center gap-2">
    {tab==='tools'&&<Button size="sm" onClick={()=>setPinsOpen(true)}><Pin size={14}/>已固定 {pinned.length}/6</Button>}
    <Button variant="primary" size="sm" onClick={()=>onEdit(tab==='categories'?{kind:'category'}:{kind:'tool'})}><Plus size={16}/> {tab==='categories'?'新增分类':'新增工具'}</Button>
   </div>
  </div>
  <div className="flex min-h-10 flex-wrap items-center gap-3">
   <div className="inline-flex h-10 shrink-0 items-center rounded-xl bg-[var(--panel-alt)] p-1">
    {([['categories','分类管理'],['tools','工具管理']] as const).map(([key,label])=><button key={key} className={'h-8 rounded-lg px-4 text-sm transition-colors '+(tab===key?'bg-[var(--panel)] shadow':'muted hover:bg-[var(--hover)]')} onClick={()=>setTab(key)}>{label}</button>)}
   </div>
   {tab==='tools'&&<div className="w-[200px] max-w-full shrink-0"><SelectField ariaLabel="筛选所属分类" value={categoryId} onValueChange={setCategoryId} options={[{value:'all',label:'全部',icon:<Icon name="layout-grid" size={15}/>},...ordered.map(c=>({value:c.id,label:c.name,icon:<Icon name={c.icon} size={15}/>}))]} className="h-10 w-full"/></div>}
   {tab==='tools'&&categoryId==='all'&&<span className="text-xs muted">全部 {tools.length} 个工具 · 跨分类排序已关闭</span>}
  </div>
  {tab==='categories'?<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e=>void sortCats(e)}>
   <SortableContext items={ordered.map(c=>c.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{ordered.map(c=><SortableRow key={c.id} id={c.id}>{handle=><>
    <button {...handle} aria-label="拖拽分类" className="touch-none cursor-grab p-1 muted"><GripVertical size={17}/></button>
    <Icon name={c.icon}/><span className="font-medium">{c.name}</span>{c.id==='default'&&<span className="rounded bg-[var(--panel-alt)] px-2 text-[10px] muted">系统默认</span>}
    <span className="text-xs muted">· {ws.tools.filter(t=>t.categoryId===c.id).length} 个工具</span>{!c.visible&&<span className="text-xs text-amber-400">已隐藏</span>}{actions(c,true)}
   </>}</SortableRow>)}</div></SortableContext>
  </DndContext>:categoryId==='all'?<div className="space-y-2">{tools.map(t=><div key={t.id} className={rowClass}>{toolRow(t)}</div>)}{!tools.length&&<p className="py-16 text-center muted">还没有工具</p>}</div>:<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e=>void sortTools(e)}>
   <SortableContext items={tools.map(t=>t.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{tools.map(t=><SortableRow key={t.id} id={t.id}>{handle=>toolRow(t,handle)}</SortableRow>)}{!tools.length&&<p className="py-16 text-center muted">这个分类还没有工具</p>}</div></SortableContext>
  </DndContext>}
  <DialogShell open={pinsOpen} onOpenChange={setPinsOpen} title={'托盘快捷工具 · '+pinned.length+'/6'} description="拖动排列托盘显示顺序。隐藏的工具仍占用名额，可在此取消固定。" footer={<Button onClick={()=>setPinsOpen(false)}>完成</Button>}>
   {!pinned.length?<p className="py-10 text-center text-sm muted">还未固定工具，请在工具行右侧点击图钉。</p>:
   <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e=>void sortPins(e)}>
    <SortableContext items={pinned.map(t=>t.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{pinned.map(t=><SortableRow key={t.id} id={t.id}>{handle=><>
     <button {...handle} aria-label={'拖动 '+t.name} className="touch-none cursor-grab p-1 muted"><GripVertical size={17}/></button>
     <Icon name={t.icon}/><span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
     {(!t.visible||!categoryById.get(t.categoryId)?.visible)&&<span className="text-xs text-amber-400">已隐藏</span>}
     <Button variant="ghost" size="sm" title={'取消固定 '+t.name} onClick={()=>togglePin(t)}><PinOff size={14}/>取消固定</Button>
    </>}</SortableRow>)}</div></SortableContext>
   </DndContext>}
  </DialogShell>
 </div>
}
