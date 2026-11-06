import {describe,expect,it} from 'vitest'
import {assembleDashboard,getDashboardSnapshot,safeDashboardReason} from '../electron/main/services/dashboard'
import type {DashboardInputs} from '../electron/main/services/dashboard'
import type {QuickLaunchTask} from '../src/shared/quickLaunchModels'
import type {TransferSnapshot} from '../src/shared/fileTransferModels'
const running=(status:QuickLaunchTask['status']):QuickLaunchTask=>({
 id:'task-1',appId:'app-1',appName:'演示脚本',status,startedAt:'2026-11-06T09:00:00Z',
 childPids:[],commandSummary:'do not expose --password=123',output:'secret',silent:true,runAsAdmin:false,truncated:false
})
const transfer={running:true,devices:[{id:'device',ip:'127.0.0.1',agent:'test',connectedAt:1,lastSeen:1}],
 incoming:[{id:'u',name:'request',size:1,received:1,ip:'127.0.0.1',status:'pending'}],
 tasks:[{id:'t',name:'somefile.txt',direction:'download',total:100,completed:50,status:'running',ip:'127.0.0.1'}]
} as TransferSnapshot
const inputs:DashboardInputs={
 quickLaunch:[running('running'),{...running('unknown'),id:'task-2',reason:'未知状态'}],
 media:{tasks:[
  {id:'m1',kind:'subtitle',name:'字幕识别',state:'ready',percent:0,createdAt:1,updatedAt:1,error:''},
  {id:'m2',kind:'extract',name:'音频提取',state:'queued',percent:0,createdAt:2,updatedAt:2,error:''},
  {id:'m3',kind:'subtitle',name:'bad',state:'failed',percent:0,createdAt:3,updatedAt:3,error:'C:\\secret\\data.txt 失败'}
 ],downloads:[{id:'small',state:'verifying',received:100,total:100},{id:'cuda-engine',state:'paused',received:30,total:100}]},
 conversion:[{id:'c',name:'转换',state:'completed',percent:100,createdAt:6,updatedAt:8,error:''}],
 transfer
}
describe('后台任务仪表盘安全聚合',()=>{
 it('ready 与待审批不混入排队，未知单列，进行中计数正确',()=>{
  const s=assembleDashboard(inputs)
  expect(s.counts).toEqual({running:3,queued:1,completed:1,failed:1,unknown:1})
  expect(s.service.pendingApprovals).toBe(1)
  expect(s.service.connectedDevices).toBe(1)
  expect(s.tasks.find(t=>t.id==='m1')?.state).toBe('ready')
  expect(s.tasks.find(t=>t.id==='m3')?.reason).not.toContain('secret')
 })
 it('IPC DTO 不泄漏本地路径、控制凭据、IP、脚本正文',()=>{
  const serialized=JSON.stringify(assembleDashboard(inputs))
  for(const secret of ['do not expose','--password=123','127.0.0.1','C:\\secret\\data.txt','"pin"'])expect(serialized).not.toContain(secret)
  expect(safeDashboardReason('C:\\user\\secret.txt failed')).toBe('任务执行失败，请进入所属工具查看详情')
 })
 it('每个来源独立故障，缺失来源不会按零处理',async()=>{
  const snapshot=await getDashboardSnapshot({
   quickLaunch:()=>{throw Error('failed')},
   media:()=>inputs.media!,
   conversion:()=>[],
   transfer:()=>{throw Error('failed')}
  })
  expect(snapshot.health).toEqual([{source:'quick-launch',available:false},{source:'media',available:true},{source:'text-conversion',available:true},{source:'transfer',available:false}])
  expect(snapshot.service.transferRunning).toBe(null)
  expect(snapshot.counts.failed).toBe(1)
 })
})
