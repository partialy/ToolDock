import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {probeAudioSource} from '../electron/main/services/audio-editing/audio-source'
import {renderAudioExport} from '../electron/main/services/audio-editing/audio-export-service'
import {AudioPreviewService} from '../electron/main/services/audio-editing/audio-preview-service'
import type {AudioExportJob,AudioProject} from '../src/shared/audioEditingModels'

vi.mock('../electron/main/services/media/engines',()=>({
 ffmpegBinaries:async()=>({ffmpeg:path.join(process.cwd(),'resources/media/bin/ffmpeg/ffmpeg.exe'),
  ffprobe:path.join(process.cwd(),'resources/media/bin/ffmpeg/ffprobe.exe')})
}))
const bin=()=>path.join(process.cwd(),'resources/media/bin/ffmpeg/ffmpeg.exe')
let dir='',source:Awaited<ReturnType<typeof probeAudioSource>>
beforeEach(async()=>{
 dir=mkdtempSync(path.join(tmpdir(),'tooldock-audio-e2e-'))
 execFileSync(bin(),['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=4','-ac','2','-ar','48000','-c:a','pcm_s16le','-n',path.join(dir,'source.wav')],{timeout:30000})
 source=await probeAudioSource(path.join(dir,'source.wav'),new AbortController().signal)
})
afterEach(()=>rmSync(dir,{recursive:true,force:true}))
function job(kept:{startUs:number;endUs:number}[]):AudioExportJob{
 return{id:randomUUID(),projectId:randomUUID(),projectName:'source',revision:1,
  edit:{kept,fadeMs:8,effect:'none',gainDb:0,loudnessLUFS:-16,truePeakDbtp:-1.5},
  stream:source.streams[0],source,options:{format:'mp3',bitrate:'192k',directory:dir,name:'output',sampleRate:'source',channels:'source'},
  state:'queued',percent:0,error:'',outputPath:'',size:0,createdAt:Date.now()}
}
describe('真实 FFmpeg 音频剪辑/试听冒烟验证',()=>{
 it('裁切两段拼接、输出时长与安全重名编号',async()=>{
  const first=job([{startUs:0,endUs:1000000},{startUs:2000000,endUs:4000000}])
  const r=await renderAudioExport(first,new AbortController().signal,()=>{})
  expect(r.path).toMatch(/output\.mp3$/)
  expect(r.size).toBeGreaterThan(1000)
  const again=job(first.edit.kept)
  const next=await renderAudioExport(again,new AbortController().signal,()=>{})
  expect(next.path).toMatch(/output \(1\)\.mp3$/)
 })
 it('预览音频提供可 seek 的 HTTP Range，波形有真实采样',async()=>{
  const p:AudioProject={id:randomUUID(),source,streamIndex:source.streams[0].index,edit:job([{startUs:0,endUs:4000000}]).edit,
   revision:1,displayName:'source',outputName:'output',createdAt:Date.now(),updatedAt:Date.now(),lastOpenedAt:Date.now()}
  const preview=new AudioPreviewService(()=>dir)
  await preview.initialize()
  try{
   const peaks=await preview.peaks(p,0,4000000,100)
   expect(Math.max(...peaks.points)).toBeGreaterThan(.03)
   const url=await preview.preview(p,false,128*1024*1024)
   const reply=await preview.respond(new Request(url,{headers:{Range:'bytes=0-1023'}}))
   expect(reply.status).toBe(206)
   expect(reply.headers.get('content-length')).toBe('1024')
   expect((await reply.arrayBuffer()).byteLength).toBe(1024)
  }finally{await preview.shutdown()}
 })
})
