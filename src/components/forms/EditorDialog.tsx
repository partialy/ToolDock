import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { SwitchField } from '@/components/ui/switch-field'
import { ICONS, Icon } from '@/components/ui/icon'
import type {Category,Tool} from '@/types/models'
import type {Workspace} from '@/store/useWorkspace'

type Edit = {kind:'category';item?:Category}|{kind:'tool';item?:Tool}
export function EditorDialog({edit,onClose,ws}:{edit:Edit|null;onClose:()=>void;ws:Workspace}){
 const [name,setName]=useState(''),[icon,setIcon]=useState('folder'),[categoryId,setCategoryId]=useState('default'),[target,setTarget]=useState(''),[visible,setVisible]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
 useEffect(()=>{if(!edit)return;setName(edit.item?.name||'');setIcon(edit.item?.icon||(edit.kind==='category'?'folder':'globe'));setCategoryId(edit.kind==='tool'?edit.item?.categoryId||'default':'default');setTarget(edit.kind==='tool'?edit.item?.target||'':'');setVisible(edit.item?.visible??true);setError('')},[edit])
 const save=async()=>{
  if(!edit)return
  setBusy(true);setError('')
  try{
   if(edit.kind==='category')await ws.execute(()=>window.toolDock.categories.save({id:edit.item?.id,name,icon,visible}))
   else await ws.execute(()=>window.toolDock.tools.save({id:edit.item?.id,name,icon,categoryId,type:edit.item?.type||'link',target:edit.item?.type==='internal'?edit.item.target:target.trim(),visible}))
   onClose()
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 }
 return <Modal open={!!edit} onOpenChange={v=>{if(!v)onClose()}} title={edit?.item?'编辑'+(edit.kind==='category'?'分类':'工具'):'新增'+(edit?.kind==='category'?'分类':'工具')}
 footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={busy} onClick={()=>void save()}>{busy?'保存中…':'保存'}</Button></>}>
  <div className="space-y-4">
   <label className="block space-y-1.5"><span className="text-xs muted">名称</span><Input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="输入名称"/></label>
   <div className="space-y-2"><div className="text-xs muted">选择图标</div>
    <div className="grid max-h-32 grid-cols-10 gap-1 overflow-y-auto rounded-xl bg-[var(--panel-alt)] p-2">
     {Object.keys(ICONS).map(key=><button type="button" key={key} title={key} aria-label={key} onClick={()=>setIcon(key)} className={'flex h-8 items-center justify-center rounded-lg '+(icon===key?'bg-indigo-500/25 text-[var(--primary)]':'hover:bg-[var(--hover)]')}><Icon name={key}/></button>)}
    </div>
   </div>
   {edit?.kind==='tool'&&<>
    <div className="space-y-1.5"><span className="block text-xs muted">所属分类</span><SelectField ariaLabel="所属分类" value={categoryId} onValueChange={setCategoryId} options={ws.categories.map(c=>({value:c.id,label:c.name,icon:<Icon name={c.icon} size={15}/>}))} className="w-full"/></div>
    <div className="text-xs muted">工具类型：{edit.item?.type==='internal'?'内部预置页面':'网页链接 (HTTPS/HTTP)'}</div>
    {edit.item?.type!=='internal'&&<label className="block space-y-1.5"><span className="text-xs muted">链接地址</span><Input value={target} onChange={e=>setTarget(e.target.value)} placeholder="https://example.com"/></label>}
   </>}
   <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2.5 text-xs"><span>在侧栏显示</span><SwitchField ariaLabel="在侧栏显示" checked={visible} onCheckedChange={setVisible}/></div>
   {error&&<div role="alert" className="text-sm text-red-400">{error}</div>}
  </div>
 </Modal>
}
