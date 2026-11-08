import {describe,it,expect,vi} from 'vitest'
import type {IncomingMessage} from 'node:http'
import {DEVICE_WORDS,nextDeviceName} from '../electron/main/services/transfer/device-names'
import {LanAuth} from '../electron/main/services/transfer/auth'

const mocks=vi.hoisted(()=>({queue:[] as number[]}))
// 可控 randomInt：单参数调用且队列非空时返回队列值，其余场景透传真实随机
vi.mock('node:crypto',async importOriginal=>{
 const actual=await importOriginal() as typeof import('node:crypto')
 const randomInt=((min:number,max?:number)=>{
  if(max===undefined&&mocks.queue.length>0)return mocks.queue.shift()!
  return max===undefined?actual.randomInt(min):actual.randomInt(min,max)
 }) as unknown as typeof actual.randomInt
 return {...actual,randomInt}
})
const NAME=/^[a-z]+-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/
describe('文件快传设备自动命名',()=>{
 it('词表 100 项唯一、全小写单词且排除保留词',()=>{
  expect(DEVICE_WORDS).toHaveLength(100)
  expect(new Set(DEVICE_WORDS).size).toBe(100)
  for(const word of DEVICE_WORDS)expect(word).toMatch(/^[a-z]+$/)
  for(const word of ['host','admin','main','system','pc','device','user','root','server','guest','localhost','phone','mobile','tooldock'])expect(DEVICE_WORDS).not.toContain(word)
 })
 it('名称为单词-4 位大写后缀，后缀排除易混淆字符 0 O 1 I L',()=>{
  const taken=new Set<string>()
  for(let i=0;i<500;i++){
   const name=nextDeviceName(taken)
   expect(name).toMatch(NAME)
   expect(name.slice(name.indexOf('-')+1)).not.toMatch(/[0OI1L]/)
   expect(taken.has(name)).toBe(false)
   taken.add(name)
  }
 })
 it('完整名已被在线设备占用时换名重试',()=>{
  const word=DEVICE_WORDS[0]
  // 前两次尝试都生成 word-2345，第三次换后缀生成 word-6789
  mocks.queue.push(0,0,1,2,3,0,0,1,2,3,0,4,5,6,7)
  expect(nextDeviceName(new Set([word+'-2345']))).toBe(word+'-6789')
  expect(mocks.queue).toHaveLength(0)
 })
 it('连续 64 次撞名后放弃生成',()=>{
  const word=DEVICE_WORDS[0]
  for(let i=0;i<64;i++)mocks.queue.push(0,0,1,2,3)
  expect(()=>nextDeviceName(new Set([word+'-2345']))).toThrow()
  expect(mocks.queue).toHaveLength(0)
 })
 it('LanAuth 授权时自动命名，刷新后同名，多设备不重名',()=>{
  const auth=new LanAuth()
  const first=auth.authorize('token',auth.bootstrap,'192.168.9.100','android')
  expect(first.name).toMatch(NAME)
  const cookie=auth.cookieFor(first.id).split(';')[0]
  const req={headers:{cookie},socket:{remoteAddress:'192.168.9.100'}} as unknown as IncomingMessage
  expect(auth.identify(req)?.name).toBe(first.name)
  const second=auth.authorize('token',auth.bootstrap,'192.168.9.101','iphone')
  expect(second.name).toMatch(NAME)
  expect(second.name).not.toBe(first.name)
 })
})
