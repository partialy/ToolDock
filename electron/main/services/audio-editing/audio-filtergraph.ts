import type {AudioEdit,AudioExportOptions,AudioRange,AudioStream} from '../../../../src/shared/audioEditingModels'
import {canonicalKept,hasCuts} from '../../../../src/shared/audioEditingModels'
import {copyExtension} from '../media/media-files'

const sec=(us:number)=>Number((us/1e6).toFixed(6)).toString()
export function validateAudioExport(edit:AudioEdit,stream:AudioStream,options:AudioExportOptions){
 const kept=canonicalKept(edit.kept,stream.durationUs)
 if(kept.some(r=>r.endUs-r.startUs<10000))throw Error('每个保留片段必须至少0.01秒')
 if(edit.effect==='gain'&&(!Number.isFinite(edit.gainDb)||Math.abs(edit.gainDb)>20))throw Error('音量增益超出范围')
 if(options.format==='copy'&&(hasCuts(edit,stream.durationUs)||edit.effect!=='none'))throw Error('已剪辑或启用音效，不能复制原始编码流，请选择 MP3/WAV/FLAC/M4A')
 if(!stream.sampleRate||stream.sampleRate<8000)throw Error('音频采样率不可用')
 return kept
}
export function audioExtension(stream:AudioStream,options:AudioExportOptions){
 return options.format==='copy'?copyExtension(stream.codec):options.format
}
export function outputCodecArgs(options:AudioExportOptions){
 const codec=options.format==='mp3'?['-c:a','libmp3lame','-b:a',options.bitrate]:
  options.format==='m4a'?['-c:a','aac','-b:a',options.bitrate]:
  options.format==='wav'?['-c:a','pcm_s16le']:
  options.format==='flac'?['-c:a','flac']:['-c:a','copy']
 if(options.sampleRate!=='source')codec.push('-ar',options.sampleRate)
 if(options.channels!=='source')codec.push('-ac',options.channels==='mono'?'1':'2')
 if(options.format==='copy'&&(options.sampleRate!=='source'||options.channels!=='source'))throw Error('复制原音轨时不能更改采样率或声道')
 return codec
}
export function audioGraph(stream:AudioStream,edit:AudioEdit,options:AudioExportOptions,normalize?:Record<string,string|number>){
 const segments=validateAudioExport(edit,stream,options)
 const hasFilter=hasCuts(edit,stream.durationUs)||edit.effect!=='none'||options.format!=='copy'
 if(!hasFilter)return{args:[] as string[],map:['-map','0:'+stream.index]}
 const parts:string[]=[]
 if(segments.length===1){
  const s=segments[0]
  parts.push('[0:'+stream.index+']asetpts=PTS-STARTPTS,atrim=start='+sec(s.startUs)+':end='+sec(s.endUs)+',asetpts=PTS-STARTPTS[joined]')
 }else{
  parts.push('[0:'+stream.index+']asetpts=PTS-STARTPTS,asplit='+segments.length+segments.map((_,i)=>'[src'+i+']').join(''))
  segments.forEach((s,i)=>parts.push('[src'+i+']atrim=start='+sec(s.startUs)+':end='+sec(s.endUs)+',asetpts=PTS-STARTPTS[seg'+i+']'))
  if(edit.fadeMs===0)parts.push(segments.map((_,i)=>'[seg'+i+']').join('')+'concat=n='+segments.length+':v=0:a=1[joined]')
  else{
   let label='seg0'
   segments.slice(1).forEach((s,j)=>{
    const fade=Math.min(edit.fadeMs*1000,(segments[j].endUs-segments[j].startUs)/2,(s.endUs-s.startUs)/2)
    const next=j===segments.length-2?'joined':'joined'+j
    parts.push('['+label+'][seg'+(j+1)+']acrossfade=d='+sec(fade)+':c1=tri:c2=tri['+next+']')
    label=next
   })
  }
 }
 const effects:string[]=[]
 if(edit.effect==='gain')effects.push('volume='+edit.gainDb+'dB')
 if(edit.effect==='normalize'){
  const opts=['I='+edit.loudnessLUFS,'TP='+edit.truePeakDbtp,'LRA=11']
  if(normalize)opts.push(...Object.entries(normalize).map(([k,v])=>k+'='+v),'linear=true')
  else opts.push('print_format=json')
  effects.push('loudnorm='+opts.join(':'))
 }
 if(effects.length)parts.push('[joined]'+effects.join(',')+'[final]')
 return{args:['-filter_complex',parts.join(';')],map:['-map',effects.length?'[final]':'[joined]']}
}
export function deletedRanges(kept:AudioRange[],durationUs:number):AudioRange[]{
 const cuts:AudioRange[]=[];let last=0
 for(const r of kept){if(r.startUs>last)cuts.push({startUs:last,endUs:r.startUs});last=r.endUs}
 if(last<durationUs)cuts.push({startUs:last,endUs:durationUs})
 return cuts
}
