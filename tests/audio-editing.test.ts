import {afterEach,describe,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import Database from '../electron/main/database/sqlite'
import {migrateAudioEditing} from '../electron/main/database/migrations/014-add-audio-editing'
import {canonicalKept,subtractInterval,keepInterval,estimatedDurationUs,hasCuts,type AudioEdit,type AudioExportOptions,type AudioStream} from '../src/shared/audioEditingModels'
import {audioGraph,audioExtension,validateAudioExport} from '../electron/main/services/audio-editing/audio-filtergraph'
import {parseAudioTime,formatAudioTime,toOriginalTime,toOutputTime} from '../src/lib/audio-editing/time'

const duration=200_000_000
const base:AudioEdit={kept:[{startUs:0,endUs:duration}],fadeMs:8,effect:'none',gainDb:0,loudnessLUFS:-16,truePeakDbtp:-1.5}
const stream:AudioStream={index:3,codec:'aac',sampleRate:48000,channels:2,startUs:0,durationUs:duration,language:'',title:''}
const options:AudioExportOptions={format:'mp3',bitrate:'192k',directory:'',name:'test',sampleRate:'source',channels:'source'}
describe('音频非破坏性剪辑',()=>{
 it('删除开头、结尾和中间多段后，保留区间正确',()=>{
  let kept=base.kept
  kept=subtractInterval(kept,{startUs:0,endUs:10_000_000},duration)
  kept=subtractInterval(kept,{startUs:60_000_000,endUs:90_000_000},duration)
  kept=subtractInterval(kept,{startUs:180_000_000,endUs:duration},duration)
  expect(kept).toEqual([{startUs:10_000_000,endUs:60_000_000},{startUs:90_000_000,endUs:180_000_000}])
  expect(estimatedDurationUs({...base,kept})).toBe(140_000_000-8_000)
  expect(hasCuts({...base,kept},duration)).toBe(true)
 })
 it('相邻与重复区间合并，短于0.01秒/全删拒绝',()=>{
  expect(canonicalKept([{startUs:0,endUs:50000},{startUs:50000,endUs:100000}],duration)).toEqual([{startUs:0,endUs:100000}])
  expect(()=>canonicalKept([{startUs:0,endUs:9000}],duration)).toThrow()
  expect(()=>subtractInterval(base.kept,{startUs:0,endUs:duration},duration)).toThrow()
  expect(()=>keepInterval(base.kept,{startUs:10_000_000,endUs:20_000_000},duration)).not.toThrow()
 })
 it('时间戳与原始/成品时间映射',()=>{
  expect(parseAudioTime('01:23.45')).toBe(83_450_000)
  expect(formatAudioTime(83_450_000)).toBe('00:01:23.45')
  const edit={...base,kept:[{startUs:0,endUs:10_000_000},{startUs:20_000_000,endUs:30_000_000}]}
  expect(toOutputTime(25_000_000,edit)).toBe(14_992_000)
  expect(toOriginalTime(14_992_000,edit)).toBe(25_000_000)
 })
 it('多区间输出生成解码级 FFmpeg 滤镜图，而不是近似流复制',()=>{
  const edit={...base,kept:[{startUs:0,endUs:10_000_000},{startUs:20_000_000,endUs:30_000_000}]}
  const graph=audioGraph(stream,edit,options)
  expect(graph.args.join(' ')).toContain('asplit=2')
  expect(graph.args.join(' ')).toContain('atrim=start=20:end=30')
  expect(graph.args.join(' ')).toContain('acrossfade=d=0.008')
  expect(graph.map).toEqual(['-map','[joined]'])
  expect(()=>validateAudioExport(edit,stream,{...options,format:'copy'})).toThrow()
  expect(audioExtension(stream,{...options,format:'copy'})).toBe('m4a')
 })
})
const folders:string[]=[]
afterEach(()=>folders.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})))
describe('SQLite v14 音频工程迁移',()=>{
 it('升级幂等且不破坏原有媒体任务与工具数据',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'tooldock-audio-'));folders.push(dir)
  const db=new Database(path.join(dir,'test.sqlite'))
  try{
   db.exec('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);CREATE TABLE media_tasks(id TEXT PRIMARY KEY);INSERT INTO media_tasks VALUES (\'legacy\');')
   migrateAudioEditing(db);migrateAudioEditing(db)
   expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations WHERE version=14').get()).toMatchObject({n:1})
   expect(db.prepare('SELECT * FROM media_tasks').get()).toMatchObject({id:'legacy'})
   expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audio_projects'").get()).toMatchObject({name:'audio_projects'})
  }finally{db.close()}
 })
})
