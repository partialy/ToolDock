import {DndContext,KeyboardSensor,PointerSensor,closestCenter,useSensor,useSensors} from '@dnd-kit/core'
import {SortableContext,rectSortingStrategy,sortableKeyboardCoordinates,arrayMove} from '@dnd-kit/sortable'
import {QuickLaunchCard,type CardAction} from './QuickLaunchCard'
import type {QuickLaunchApp,QuickLaunchTask} from '@/shared/quickLaunchModels'
import {isQuickLaunchLocked} from '@/shared/quickLaunchModels'
export function QuickLaunchGrid({apps,allApps,tasks,sortable,trigger,pending,onAction,onReorder}:{apps:QuickLaunchApp[];allApps:QuickLaunchApp[];tasks:Map<string,QuickLaunchTask>;sortable:boolean;trigger:'single'|'double';pending:string[];onAction:(app:QuickLaunchApp,action:CardAction)=>void;onReorder:(ids:string[])=>void}){
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}))
 const canMove=(app:QuickLaunchApp,direction:number)=>{const index=apps.findIndex(a=>a.id===app.id),next=apps[index+direction];return !!next&&!isLocked(app.id)&&!isLocked(next.id)}
 const isLocked=(id:string)=>{const task=tasks.get(id);return !!task&&isQuickLaunchLocked(task)}
 const reorder=(active:string,over:string)=>{
  if(!sortable||pending.length)return
  const visible=allApps.filter(a=>a.visible),from=visible.findIndex(a=>a.id===active),to=visible.findIndex(a=>a.id===over)
  if(from<0||to<0||from===to||isLocked(active))return
  const visibleMoved=arrayMove(visible,from,to);let slot=0
  const moved=allApps.map(app=>app.visible?visibleMoved[slot++]:app)
  if(allApps.some((a,i)=>isLocked(a.id)&&moved[i].id!==a.id))return
  onReorder(moved.map(a=>a.id))
 }
 return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({active,over})=>{if(over)reorder(String(active.id),String(over.id))}}><SortableContext items={apps.map(a=>a.id)} strategy={rectSortingStrategy}><div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">{apps.map(app=><QuickLaunchCard key={app.id} app={app} task={tasks.get(app.id)} sortable={sortable} trigger={trigger} disabled={pending.includes(app.id)||pending.includes('order:'+app.groupId)} canForward={canMove(app,-1)} canBack={canMove(app,1)} onAction={action=>onAction(app,action)}/>)}</div></SortableContext></DndContext>
}
