import {FolderOpen,RotateCcw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {SelectField} from '@/components/ui/select-field'
import type {MediaKind,MediaPreferences,ModelRecord} from '@/shared/mediaModels'
import {MediaField} from './media-ui'

export function MediaProcessingOptions({kind,prefs,models,disabled,onChange,onDirectory,onModels}:{kind:MediaKind;prefs:MediaPreferences;models:ModelRecord[];disabled:boolean;onChange:(patch:Partial<MediaPreferences>)=>void;onDirectory:()=>void;onModels:()=>void}){
 return <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
  <h2 className="text-sm font-semibold">处理设置</h2>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
   {kind==='extract'?<>
    <MediaField label="输出格式"><SelectField ariaLabel="音频输出格式" value={prefs.outputFormat} disabled={disabled} onValueChange={v=>onChange({outputFormat:v as MediaPreferences['outputFormat']})} options={[{value:'mp3',label:'MP3'},{value:'wav',label:'WAV · 无损 PCM'},{value:'flac',label:'FLAC · 无损压缩'},{value:'m4a',label:'M4A · AAC'},{value:'copy',label:'复制原音轨 · 不重新编码'}]}/></MediaField>
    <MediaField label="音频码率"><SelectField ariaLabel="音频码率" value={prefs.bitrate} disabled={disabled||!['mp3','m4a'].includes(prefs.outputFormat)} onValueChange={v=>onChange({bitrate:v as MediaPreferences['bitrate']})} options={['128k','192k','256k','320k'].map(value=>({value,label:value.replace('k',' kbps')}))}/></MediaField>
   </>:<>
    <MediaField label="识别模型"><SelectField ariaLabel="字幕识别模型" value={prefs.selectedModelId} disabled={disabled} onValueChange={selectedModelId=>onChange({selectedModelId})} options={models.map(model=>({value:model.id,label:model.name+(model.installed?'':' · 未安装')}))}/><button className="text-xs text-indigo-400 hover:underline" onClick={onModels}>下载 / 管理模型</button></MediaField>
    <MediaField label="计算模式"><SelectField ariaLabel="识别计算模式" value={prefs.computeMode} disabled={disabled} onValueChange={v=>onChange({computeMode:v as MediaPreferences['computeMode']})} options={[{value:'auto',label:'自动 · GPU 失败回退 CPU'},{value:'gpu',label:'GPU · NVIDIA CUDA'},{value:'cpu',label:'CPU'}]}/></MediaField>
    <MediaField label="语音语言"><SelectField ariaLabel="语音语言" value={prefs.language} disabled={disabled} onValueChange={v=>onChange({language:v as MediaPreferences['language']})} options={[{value:'auto',label:'自动检测'},{value:'zh',label:'中文'},{value:'en',label:'英文'}]}/></MediaField>
   </>}
  </div>
  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4"><span className="text-xs muted">输出位置</span><span title={prefs.outputDirectory||'原文件所在目录'} className="min-w-0 flex-1 break-all text-xs">{prefs.outputDirectory||'原文件所在目录'}</span><Button size="sm" disabled={disabled} onClick={onDirectory}><FolderOpen size={14}/>指定目录</Button>{prefs.outputDirectory&&<Button size="sm" variant="ghost" disabled={disabled} onClick={()=>onChange({outputDirectory:''})}><RotateCcw size={14}/>原目录</Button>}</div>
  <p className="text-xs leading-5 muted">{kind==='extract'?'同名文件自动重命名，不覆盖原文件。复制原音轨时，根据源编码自动选择兼容容器。':'生成带时间戳的 SRT 字幕，结果可能有误识别，请在使用前预览校对。模型与媒体内容均在本机处理。'}</p>
 </section>
}
