import {randomUUID} from 'node:crypto'
import type Database from './sqlite'
import {quickLaunchSaveSchema,type QuickLaunchApp,type QuickLaunchGroup,type QuickLaunchSave} from '../../../src/shared/quickLaunchModels'

type Row=Record<string,unknown>
const asGroup=(r:Row):QuickLaunchGroup=>({id:String(r.id),name:String(r.name),sortOrder:Number(r.sort_order),createdAt:String(r.created_at),updatedAt:String(r.updated_at)})
const asApp=(r:Row):QuickLaunchApp=>({id:String(r.id),groupId:String(r.group_id),sortOrder:Number(r.sort_order),visible:!!r.visible,name:String(r.name),description:String(r.description),iconKind:r.icon_kind as QuickLaunchApp['iconKind'],iconValue:String(r.icon_value),shell:r.runtime_shell as QuickLaunchApp['shell'],psFlavor:r.ps_flavor as QuickLaunchApp['psFlavor'],sourceKind:r.source_kind as QuickLaunchApp['sourceKind'],inlineContent:String(r.inline_content),managedScript:r.managed_script_relpath?String(r.managed_script_relpath):null,scriptName:r.script_name?String(r.script_name):null,workingDirectory:String(r.working_directory),silent:!!r.silent,runAsAdmin:!!r.run_as_admin,confirmBeforeRun:!!r.confirm_before_run,confirmTitle:String(r.confirm_title),confirmMessage:String(r.confirm_message),confirmAccept:String(r.confirm_accept),confirmCancel:String(r.confirm_cancel),revision:Number(r.revision),createdAt:String(r.created_at),updatedAt:String(r.updated_at)})
const complete=(ids:string[],have:string[])=>{if(ids.length!==have.length||new Set(ids).size!==have.length||!ids.every(id=>have.includes(id)))throw Error('排序列表必须包含全部项目且不能重复')}

/** 所有变更都在事务中再次核验锁；调用方串行协调资源写入与启动。 */
export class QuickLaunchRepository {
 constructor(private database:()=>Database,private assertUnlocked:(id:string)=>void){}
 private get db(){return this.database()}
 listApps(){return (this.db.prepare('SELECT * FROM quick_launch_apps ORDER BY group_id,sort_order,id').all() as Row[]).map(asApp)}
 listGroups(){return (this.db.prepare('SELECT * FROM quick_launch_groups ORDER BY sort_order,id').all() as Row[]).map(asGroup)}
 getApp(id:string){const r=this.db.prepare('SELECT * FROM quick_launch_apps WHERE id=?').get(id) as Row|undefined;if(!r)throw Error('App 不存在');return asApp(r)}
 private group(id:string){if(!this.db.prepare('SELECT id FROM quick_launch_groups WHERE id=?').get(id))throw Error('分组不存在')}
 private version(id:string,revision:number){this.assertUnlocked(id);const current=this.getApp(id);if(current.revision!==revision)throw Error('App 已被修改，请刷新后重试');return current}
 save(raw:QuickLaunchSave,resources:{id:string;managedScript:string|null;scriptName:string|null;iconValue:string}){
  const input=quickLaunchSaveSchema.parse(raw),d=input.data
  return this.db.transaction(()=>{
   const prev=input.id?this.version(input.id,input.expectedRevision??0):null
   if(!prev&&this.listApps().length>=1000)throw Error('最多保存 1000 个 App')
   this.group(d.groupId)
   if(d.sourceKind==='file'&&!resources.managedScript)throw Error('请选择托管脚本')
   const id=prev?.id??resources.id,now=new Date().toISOString()
   const order=prev?.groupId===d.groupId?prev.sortOrder:this.nextOrder(d.groupId)
   const row={id,group_id:d.groupId,sort_order:order,visible:Number(d.visible),name:d.name,description:d.description,icon_kind:d.iconKind,icon_value:resources.iconValue,runtime_shell:d.shell,ps_flavor:d.psFlavor,source_kind:d.sourceKind,inline_content:d.sourceKind==='inline'?d.inlineContent:'',managed_script_relpath:d.sourceKind==='file'?resources.managedScript:null,script_name:d.sourceKind==='file'?resources.scriptName:null,working_directory:d.workingDirectory,silent:Number(d.silent),run_as_admin:Number(d.runAsAdmin),confirm_before_run:Number(d.confirmBeforeRun),confirm_title:d.confirmTitle,confirm_message:d.confirmMessage,confirm_accept:d.confirmAccept,confirm_cancel:d.confirmCancel,revision:(prev?.revision??0)+1,created_at:prev?.createdAt??now,updated_at:now}
   const columns=Object.keys(row)
   this.db.prepare(`INSERT INTO quick_launch_apps (${columns.join(',')}) VALUES (${columns.map(k=>'@'+k).join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(k=>k!=='id').map(k=>`${k}=excluded.${k}`).join(',')}`).run(row)
   return this.getApp(id)
  })()
 }
 private nextOrder(groupId:string){return (this.db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM quick_launch_apps WHERE group_id=?').get(groupId) as {n:number}).n}
 setVisible(id:string,revision:number,visible:boolean){this.db.transaction(()=>{this.version(id,revision);this.db.prepare('UPDATE quick_launch_apps SET visible=?,revision=revision+1,updated_at=? WHERE id=?').run(Number(visible),new Date().toISOString(),id)})()}
 remove(id:string,revision:number){return this.db.transaction(()=>{const item=this.version(id,revision);this.db.prepare('DELETE FROM quick_launch_apps WHERE id=?').run(id);return item})()}
 reorderApps(groupId:string,ids:string[]){this.db.transaction(()=>{
  this.group(groupId);const items=this.listApps().filter(a=>a.groupId===groupId);complete(ids,items.map(a=>a.id))
  items.forEach((a,index)=>{if(ids[index]!==a.id)this.assertUnlocked(a.id)})
  ids.forEach((id,i)=>{const order=items[i].sortOrder;this.db.prepare('UPDATE quick_launch_apps SET sort_order=?,revision=revision+1,updated_at=? WHERE id=? AND sort_order<>?').run(order,new Date().toISOString(),id,order)})
 })()}
 saveGroup(name:string,id?:string){return this.db.transaction(()=>{
  name=name.trim();if(!name||name.length>60)throw Error('分组名称必须为 1–60 字符')
  if(id){this.group(id);this.listApps().filter(a=>a.groupId===id).forEach(a=>this.assertUnlocked(a.id))}
  else if(this.listGroups().length>=100)throw Error('最多保存 100 个分组')
  const now=new Date().toISOString(),groupId=id??randomUUID()
  this.db.prepare('INSERT INTO quick_launch_groups VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at').run(groupId,name,this.listGroups().length,now,now)
  return this.listGroups().find(g=>g.id===groupId)!
 })()}
 removeGroup(id:string){this.db.transaction(()=>{
  if(id==='ungrouped')throw Error('默认分组不可删除');this.group(id)
  const items=this.listApps().filter(a=>a.groupId===id);items.forEach(a=>this.assertUnlocked(a.id));const offset=this.nextOrder('ungrouped')
  items.forEach((a,i)=>this.db.prepare("UPDATE quick_launch_apps SET group_id='ungrouped',sort_order=?,revision=revision+1,updated_at=? WHERE id=?").run(offset+i,new Date().toISOString(),a.id))
  this.db.prepare('DELETE FROM quick_launch_groups WHERE id=?').run(id)
 })()}
 reorderGroups(ids:string[]){this.db.transaction(()=>{const groups=this.listGroups();complete(ids,groups.map(g=>g.id));groups.forEach((g,i)=>{if(ids[i]!==g.id)this.listApps().filter(a=>a.groupId===g.id).forEach(a=>this.assertUnlocked(a.id))});ids.forEach((id,i)=>this.db.prepare('UPDATE quick_launch_groups SET sort_order=?,updated_at=? WHERE id=?').run(i,new Date().toISOString(),id))})()}
}
