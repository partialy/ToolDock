import {useEffect,useState} from 'react'
import {Download,FolderOpen} from 'lucide-react'
import {DialogShell} from '@/components/ui/dialog-shell'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import {msg} from '@/components/ui/message'
import type {AudioProject,AudioExportOptions} from '@/shared/audioEditingModels'
import {hasCuts} from '@/shared/audioEditingModels'
import type {MediaPreferences} from '@/shared/mediaModels'

export function AudioExportDialog({open,onOpenChange,projects,prefs,directory,onDone}:{
 open:boolean;onOpenChange:(v:boolean)=>void;projects:AudioProject[];prefs:MediaPreferences;directory:string;onDone:()=>void
}){
 const [format,setFormat]=useState<AudioExportOptions['format']>('mp3'),[bitrate,setBitrate]=useState<AudioExportOptions['bitrate']>('192k')
 const [outputDir,setOutputDir]=useState(''),[name,setName]=useState(''),[sampleRate,setSampleRate]=useState<AudioExportOptions['sampleRate']>('source')
 const [channels,setChannels]=useState<AudioExportOptions['channels']>('source'),[running,setRunning]=useState(false)
 const single=projects.length===1?projects[0]:null
 useEffect(()=>{
  if(!open)return
  const first=projects[0]
  const stream=first?.source.streams.find(s=>s.index===first.streamIndex)
  const sourceFormat=prefs.outputFormat
  setFormat(sourceFormat==='copy'&&first&&stream&&(hasCuts(first.edit,stream.durationUs)||first.edit.effect!=='none')?'mp3':sourceFormat)
  setBitrate(prefs.bitrate);setOutputDir(directory||prefs.outputDirectory)
  setName(single?(single.outputName+(stream&&hasCuts(single.edit,stream.durationUs)?'_edited':'')):'批量导出')
  setSampleRate('source');setChannels('source')
 },[open,projects.length,projects[0]?.id,prefs.outputFormat,prefs.bitrate,directory])
 const choose=async()=>{const folder=await window.toolDock.audio.chooseDirectory();if(folder)setOutputDir(folder)}
 const submit=async()=>{
  if(!projects.length)return
  setRunning(true)
  try{
   await window.toolDock.audio.export(projects.map(p=>p.id),{format,bitrate,directory:outputDir,name,sampleRate,channels})
   msg.success('已添加 '+projects.length+' 项到音频导出队列')
   onOpenChange(false);onDone()
  }catch(e){msg.error(e)}finally{setRunning(false)}
 }
 return <DialogShell open={open} onOpenChange={onOpenChange} title={single?'导出音频 · '+single.displayName:'批量导出音频'}
  description="音频导出时才写入目标目录；导出期间可以继续编辑其他工程，已有文件绝不会被覆盖。"
  width="lg" footer={<><Button disabled={running} onClick={()=>onOpenChange(false)}>取消</Button><Button variant="primary" disabled={running||!projects.length} onClick={()=>void submit()}><Download size={15}/>开始导出</Button></>}>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
   <label className="space-y-2 text-xs"><span className="muted">输出格式</span><SelectField ariaLabel="输出格式" value={format} onValueChange={v=>setFormat(v as AudioExportOptions['format'])} options={[{value:'mp3',label:'MP3'},{value:'wav',label:'WAV'},{value:'flac',label:'FLAC'},{value:'m4a',label:'M4A / AAC'},{value:'copy',label:'复制原音轨'}]}/></label>
   <label className="space-y-2 text-xs"><span className="muted">音频码率</span><SelectField ariaLabel="音频码率" value={bitrate} disabled={format!=='mp3'&&format!=='m4a'} onValueChange={v=>setBitrate(v as AudioExportOptions['bitrate'])} options={['128k','192k','256k','320k'].map(v=>({value:v,label:v.replace('k',' kbps')}))}/></label>
   <label className="space-y-2 text-xs"><span className="muted">采样率</span><SelectField ariaLabel="采样率" value={sampleRate} onValueChange={v=>setSampleRate(v as AudioExportOptions['sampleRate'])} options={[{value:'source',label:'跟随源音轨'},{value:'44100',label:'44.1 kHz'},{value:'48000',label:'48 kHz'}]}/></label>
   <label className="space-y-2 text-xs"><span className="muted">声道</span><SelectField ariaLabel="声道" value={channels} onValueChange={v=>setChannels(v as AudioExportOptions['channels'])} options={[{value:'source',label:'跟随源音轨'},{value:'mono',label:'单声道'},{value:'stereo',label:'立体声'}]}/></label>
  </div>
  {single&&<label className="mt-4 block space-y-2 text-xs"><span className="muted">输出文件名（不含扩展名）</span><input value={name} onChange={e=>setName(e.target.value)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 outline-none focus:border-indigo-400"/></label>}
  <div className="mt-4 space-y-2"><span className="text-xs muted">保存目录（留空则为原文件所在目录）</span>
   <div className="flex items-center gap-2"><input value={outputDir} onChange={e=>setOutputDir(e.target.value)} placeholder="原文件所在目录" className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 text-xs outline-none focus:border-indigo-400"/><Button onClick={()=>void choose()}><FolderOpen size={15}/>选择</Button></div>
  </div>
  {format==='copy'&&<p className="mt-3 text-xs text-amber-500">仅在未裁切、未启用音效且采样率/声道不变时允许复制原音轨。</p>}
 </DialogShell>
}
