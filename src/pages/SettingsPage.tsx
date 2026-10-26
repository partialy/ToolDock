import { useEffect,useState } from 'react'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/select-field'
import { SwitchField } from '@/components/ui/switch-field'
import {useDialog} from '@/components/ui/dialog-provider'
import { Archive, Folder, HardDrive, ShieldCheck, Trash2, AlertTriangle, RotateCw } from 'lucide-react'
import type {DataInfo} from '@/types/models'
import type {Workspace} from '@/store/useWorkspace'
function SettingRow({title,description,children}:{title:string;description:string;children:React.ReactNode}){return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] py-4 last:border-b-0"><div className="max-w-lg"><div className="font-medium">{title}</div><p className="mt-1 text-xs leading-5 muted">{description}</p></div><div className="shrink-0">{children}</div></div>}
export function SettingsPage({ws}:{ws:Workspace}){
 const dialog=useDialog()
 const [info,setInfo]=useState<DataInfo|null>(null),[target,setTarget]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[restart,setRestart]=useState(false),[busy,setBusy]=useState(false)
 const load=()=>window.toolDock.data.getInfo().then(setInfo).catch(e=>setError(String(e)))
 useEffect(()=>{void load()},[])
 const action=async(fn:()=>Promise<unknown>,success:string)=>{setBusy(true);setError('');setMessage('');try{const result=await fn();setMessage(success);await load();return result}catch(e){setError(e instanceof Error?e.message:String(e));return null}finally{setBusy(false)}}
 const select=async()=>{const p=await window.toolDock.data.choose();if(p)setTarget(p)}
 const migrate=async()=>{
  if(!target||!await dialog.confirm({title:'迁移数据目录',description:'将当前数据复制到新目录并在重新启动后切换。原目录保留，是否继续？',variant:'warning',confirmText:'确认迁移'}))return
  const result=await action(()=>window.toolDock.data.migrate(target),'数据复制完成，请重新启动应用以启用新目录。')
  if(result)setRestart(true)
 }
 const restore=async()=>{if(!await dialog.confirm({title:'恢复数据备份',description:'恢复备份可能覆盖当前分类、工具和设置。选择备份后主进程还会再次要求确认。',variant:'danger',confirmText:'继续选择备份'}))return;const result=await action(()=>window.toolDock.data.restore(),'备份数据已恢复，请重新启动应用。');if(result)setRestart(true)}
 const clearOld=async(id:string,path:string)=>{if(await dialog.confirm({title:'删除旧数据副本',description:'即将删除：\n'+path+'\n此操作不可撤销。',variant:'danger',confirmText:'确认永久删除'}))await action(()=>window.toolDock.data.deleteOld(id),'旧数据已删除')}
 return <div className="mx-auto max-w-4xl space-y-7 p-7">
  <div><h1 className="text-2xl font-semibold">设置</h1><p className="mt-2 text-sm muted">调整工作区外观、网页安全策略和本地数据存储。</p></div>
  <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="mb-2 text-sm font-semibold">外观与体验</h2>
   <SettingRow title="外观主题" description="默认为暗色，也可以切换到浅色。"><SelectField value={ws.settings.theme} ariaLabel="外观主题" onValueChange={v=>void ws.setPreference('theme',v as 'dark'|'light')} options={[{value:'dark',label:'暗色主题',description:'适合长时间专注使用'},{value:'light',label:'浅色主题',description:'适合明亮环境'}]} className="min-w-[148px]"/></SettingRow>
   <SettingRow title="动效偏好" description="支持柔和微动画；减少动画模式适合需要减少位移动画的用户。"><SelectField value={ws.settings.motion} ariaLabel="动效偏好" onValueChange={v=>void ws.setPreference('motion',v as 'normal'|'reduced'|'off')} options={[{value:'normal',label:'标准动效',description:'自然弹簧与微交互'},{value:'reduced',label:'减少动效',description:'尽量减少位移与缩放'},{value:'off',label:'关闭动效',description:'无过渡，立即切换'}]} className="min-w-[148px]"/></SettingRow>
   <SettingRow title="应用内通知位置" description="通知可显示在四个角落，默认右下角；不影响 Windows 系统通知的位置。"><SelectField value={ws.settings.notificationPosition} ariaLabel="通知位置" onValueChange={v=>void ws.setPreference('notificationPosition',v as typeof ws.settings.notificationPosition)} options={[{value:'bottom-right',label:'右下角（默认）'},{value:'bottom-left',label:'左下角'},{value:'top-right',label:'右上角'},{value:'top-left',label:'左上角'}]} className="min-w-[148px]"/><Button size="sm" onClick={()=>window.dispatchEvent(new CustomEvent('tooldock:toast',{detail:{title:'通知位置预览',description:'这是一条 ToolDock 应用内测试通知。',level:'info'}}))}>测试通知</Button></SettingRow>
   <SettingRow title="显示默认分类标记" description="在默认分类名称末尾显示“默认”Tag，分类名称仍然可以自定义。"><SwitchField checked={ws.settings.showDefaultTag} ariaLabel="显示默认分类标记" onCheckedChange={v=>void ws.setPreference('showDefaultTag',v)}/></SettingRow>
  </section>
  <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17}/> 网页安全</h2>
   <SettingRow title="允许加载 HTTP 网页" description="默认关闭。开启后允许非加密 HTTP，但不会向外部网页开放 Electron/Node.js 权限；localhost 始终允许。"><SwitchField checked={ws.settings.allowHttp} ariaLabel="允许加载 HTTP 网页" onCheckedChange={v=>void ws.setPreference('allowHttp',v)}/></SettingRow>
  </section>
  <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><HardDrive size={17}/> 数据存储</h2>
   <SettingRow title="当前数据目录" description={info?.root||'读取中...'}><Button size="sm" onClick={()=>void window.toolDock.data.openFolder()}><Folder size={15}/> 打开目录</Button></SettingRow>
   <div className="mt-4 space-y-3"><label className="block text-xs muted">新数据目录（必须为空）</label>
    <div className="flex flex-wrap gap-2"><input readOnly value={target} placeholder="选择迁移目标目录" className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-3"/><Button size="sm" onClick={()=>void select()}>浏览</Button><Button size="sm" variant="primary" disabled={!target||busy} onClick={()=>void migrate()}>迁移数据</Button></div>
   </div>
   {!!info?.oldCopies.length&&<div className="mt-5"><h3 className="mb-2 text-xs font-semibold muted">旧数据副本</h3>{info.oldCopies.filter(x=>!x.removed).map(x=><div key={x.id} className="flex items-center justify-between gap-3 border-t border-[var(--border)] py-2"><span className="truncate text-xs" title={x.path}>{x.path}</span><Button size="sm" variant="danger" disabled={busy} onClick={()=>void clearOld(x.id,x.path)}><Trash2 size={14}/> 删除旧数据</Button></div>)}</div>}
  </section>
  <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Archive size={17}/> 备份与恢复</h2>
   <p className="mb-4 text-xs muted">手动备份分类、工具、设置及工具文件。备份可能包含敏感信息，请妥善保管。</p>
   <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={()=>void action(()=>window.toolDock.data.backup(),'备份已保存')}><Archive size={14}/> 导出备份</Button><Button size="sm" disabled={busy} onClick={()=>void restore()}><RotateCw size={14}/> 从备份恢复</Button></div>
  </section>
  <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5"><h2 className="mb-2 text-sm font-semibold">诊断日志</h2><p className="mb-4 text-xs muted">仅在本机记录操作失败类型，不记录密码、私钥或网页内容；最多保存7天。</p><div className="flex gap-2"><Button size="sm" onClick={()=>void action(()=>window.toolDock.data.exportLogs(),'诊断日志已导出')}>导出诊断日志</Button><Button size="sm" variant="danger" onClick={()=>void dialog.confirmAction({title:'清空诊断日志',description:'清空所有本地诊断日志？操作后无法恢复。',variant:'danger',confirmText:'清空日志',onConfirm:async()=>{await action(()=>window.toolDock.data.clearLogs(),'日志已清空')}})}>清空日志</Button></div></section>
  {restart&&<div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"><span className="text-sm text-amber-300">数据已准备好，重启后切换。</span><Button variant="primary" onClick={()=>void window.toolDock.data.restart()}>立即重启</Button></div>}
  {message&&<p role="status" className="text-sm text-emerald-400">{message}</p>}{error&&<p role="alert" className="text-sm text-red-400">{error}</p>}
 </div>
}
