import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import path from 'node:path'
import {mediaPreferencesPatchSchema} from '../src/shared/mediaModels'

const database=vi.hoisted(()=>({write:vi.fn()}))
vi.mock('../electron/main/database/store',()=>({getDataRoot:()=>path.resolve('plans/media-preferences-data'),getDb:()=>({prepare:()=>({run:database.write})})}))
vi.mock('electron',()=>({app:{isPackaged:false},dialog:{},shell:{}}))
vi.mock('../electron/main/services/media/model-storage',()=>({ModelStorage:class{
 constructor(private config:{setDirectory:(directory:string)=>void}){}
 isBusy(){return false}
 async migrateDirectory(directory:string){this.config.setDirectory(directory)}
}}))
import {MediaService} from '../electron/main/services/media/media-service'
import {registerMediaIpc} from '../electron/main/services/media/ipc'

let service:MediaService
let setPreferences:(payload:unknown)=>unknown
beforeEach(()=>{
 vi.useFakeTimers();database.write.mockReset();service=new MediaService(()=>null)
 registerMediaIpc((channel,handler)=>{if(channel==='media:setPreferences')setPreferences=handler},service,()=>null)
})
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()})

describe('媒体偏好稀疏更新',()=>{
 it('不会给外部模型选择或加速开关注入未提交字段',()=>{
  expect(mediaPreferencesPatchSchema.parse({selectedModelId:'import-local-model'})).toEqual({selectedModelId:'import-local-model'})
  expect(mediaPreferencesPatchSchema.parse({accelerationEnabled:true})).toEqual({accelerationEnabled:true})
  expect(mediaPreferencesPatchSchema.parse({})).toEqual({})
  expect(mediaPreferencesPatchSchema.parse({language:undefined})).toEqual({})
 })
 it('外部引用模型选择和加速开关通过 IPC 后保留其他用户偏好',async()=>{
  const modelDirectory=path.resolve('plans/custom-models'),outputDirectory=path.resolve('plans/media-output')
  await service.models.migrateDirectory(modelDirectory,false)
  await service.setPreferences({outputFormat:'flac',bitrate:'320k',language:'en',computeMode:'gpu',parallelSegments:8,outputDirectory})
  const previous=service.getPreferences()
  await setPreferences({selectedModelId:'import-local-model'})
  expect(service.getPreferences()).toEqual({...previous,selectedModelId:'import-local-model'})
  await setPreferences({accelerationEnabled:true})
  expect(service.getPreferences()).toEqual({...previous,selectedModelId:'import-local-model',accelerationEnabled:true})
  const saved=JSON.parse(database.write.mock.calls.at(-1)![1])
  expect(saved).toMatchObject({modelDirectory,outputDirectory,outputFormat:'flac',language:'en',parallelSegments:8,accelerationEnabled:true})
 })
 it('仍拒绝普通补丁改模型目录及指定任意 FFmpeg 程序',async()=>{
  await expect(setPreferences({modelDirectory:path.resolve('plans/unapproved-models')})).rejects.toThrow('专用目录或程序选择器')
  await expect(setPreferences({modelDirectory:''})).rejects.toThrow('专用目录或程序选择器')
  await expect(setPreferences({ffmpegOverride:path.resolve('plans/ffmpeg.exe')})).rejects.toThrow('专用目录或程序选择器')
  expect(database.write).not.toHaveBeenCalled()
  await expect(setPreferences({ffmpegOverride:''})).resolves.toBeUndefined()
 })
 it('Service 直接调用同样校验未知字段、无效值并忽略 undefined',async()=>{
  await service.setPreferences({language:'zh'})
  await service.setPreferences({language:undefined,accelerationEnabled:true})
  expect(service.getPreferences()).toMatchObject({language:'zh',accelerationEnabled:true})
  await expect(service.setPreferences({parallelSegments:99})).rejects.toThrow()
  expect(()=>setPreferences({unexpected:true})).toThrow()
 })
 it('SQLite 保存失败时保留内存中的原偏好',async()=>{
  const previous=service.getPreferences();database.write.mockImplementationOnce(()=>{throw Error('数据库写入失败')})
  await expect(setPreferences({accelerationEnabled:true})).rejects.toThrow('数据库写入失败')
  expect(service.getPreferences()).toEqual(previous)
 })
})
