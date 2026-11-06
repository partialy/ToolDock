import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'

const mocks=vi.hoisted(()=>({download:vi.fn(),hash:vi.fn(),progress:vi.fn(),root:''}))
vi.mock('../electron/main/services/media/model-download',()=>({downloadAsset:mocks.download,sha256:mocks.hash,readDownloadProgress:mocks.progress}))
vi.mock('../electron/main/services/media/model-catalog',()=>({MODEL_CATALOG:[],CUDA_ASSET:{version:'test',bytes:128,sha256:'verified',url:'https://example.com/cuda.zip'},catalogModel:()=>{throw Error('unknown')}}))
vi.mock('../electron/main/services/media/engines',()=>({mediaBinaryRoot:()=>path.join(mocks.root,'bin')}))
vi.mock('../electron/main/database/store',()=>({getDb:()=>({prepare:()=>({get:()=>undefined})})}))
import {ModelStorage} from '../electron/main/services/media/model-storage'
import {defaultMediaPreferences} from '../src/shared/mediaModels'

let storage:ModelStorage,root:string,runtime:string
beforeEach(async()=>{
 root=await fs.mkdtemp(path.resolve('plans/engine-test-'));runtime=path.join(root,'runtime');mocks.root=root
 mocks.download.mockReset();mocks.hash.mockReset().mockResolvedValue('');mocks.progress.mockReset().mockResolvedValue(null)
 storage=new ModelStorage({getPreferences:()=>({...defaultMediaPreferences,modelDirectory:path.join(root,'models')}),setDirectory:()=>{},getRuntimeDirectory:()=>runtime,isBusy:()=>false,onChange:()=>{}})
})
afterEach(async()=>{await storage.shutdown();await fs.rm(root,{recursive:true,force:true})})
async function finished(){for(let i=0;i<200&&storage.isBusy();i++)await new Promise(r=>setTimeout(r,2));expect(storage.isBusy()).toBe(false)}
describe('CUDA 下载任务恢复',()=>{
 it('失败保留已下载进度并提供中文超时提示，允许继续重试',async()=>{
  mocks.download.mockImplementation(async(asset,_file,options)=>{options.update({id:asset.id,state:'downloading',received:64,total:128});throw Error('The operation was aborted due to timeout')})
  await storage.installCuda();await finished()
  expect(storage.downloads()[0]).toMatchObject({state:'failed',received:64,error:'下载连接长时间无响应，已保留断点，请重试安装'})
  await storage.resume('cuda-engine');await finished();expect(mocks.download).toHaveBeenCalledTimes(2)
 })
 it('重新进入页面发现 CUDA 断点并显示真实完成字节',async()=>{
  mocks.progress.mockResolvedValue(73);await storage.list()
  expect(storage.downloads()).toMatchObject([{id:'cuda-engine',state:'paused',received:73,total:128}])
  expect(mocks.progress).toHaveBeenCalledWith(expect.objectContaining({id:'cuda-engine'}),path.join(runtime,'cuda-test.zip'))
 })
 it('用户取消只清除引擎临时下载，不删除完整缓存包',async()=>{
  await fs.mkdir(runtime);const archive=path.join(runtime,'cuda-test.zip');await fs.writeFile(archive,'verified cache')
  for(const suffix of ['.part','.part.json','.part.json.tmp'])await fs.writeFile(archive+suffix,'partial')
  await storage.cancel('cuda-engine')
  expect(await fs.readFile(archive,'utf8')).toBe('verified cache')
  expect(await fs.stat(archive+'.part').catch(()=>null)).toBeNull();expect(storage.downloads()[0].state).toBe('cancelled')
 })
 it('缓存校验后进入独立安装阶段，卸载清除完成状态以便再次安装',async()=>{
  await fs.mkdir(runtime);const zip=new AdmZip();zip.addFile('whisper-cli.exe',Buffer.from('fixture'));zip.writeZip(path.join(runtime,'cuda-test.zip'));mocks.hash.mockResolvedValue('verified')
  const cpu=path.join(root,'bin','whisper');await fs.mkdir(cpu,{recursive:true});for(const name of ['THIRD-PARTY-NOTICES.md','whisper-LICENSE.txt','SDL2-LICENSE.txt'])await fs.writeFile(path.join(cpu,name),'license')
  await storage.installCuda();await finished();expect(storage.downloads()[0]).toMatchObject({state:'completed',received:128})
  await storage.removeCuda();expect(storage.downloads()).toEqual([])
  await storage.installCuda();await finished();expect(storage.downloads()[0].state).toBe('completed');expect(mocks.download).not.toHaveBeenCalled()
 })
})
