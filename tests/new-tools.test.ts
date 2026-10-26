import {describe,it,expect} from 'vitest'
import {generateUuids} from '../src/lib/uuid'
import {outputDimensions,fitRect} from '../src/lib/image/geometry'
import {createIco} from '../src/lib/image/ico'
import {timestampToDate,parseLocalDateTime,dateToTimestamps} from '../src/lib/time/timestamp'
import {createPrivateKey,createPublicKey,sign,verify} from 'node:crypto'
import {generateEc,generateRandom} from '../electron/main/services/crypto'
describe('新增工具核心算法',()=>{
 it('秒/毫秒识别、负时间戳与非法时间',()=>{
  expect(timestampToDate('1700000000').getTime()).toBe(1700000000000)
  expect(timestampToDate('1700000000000').getTime()).toBe(1700000000000)
  expect(timestampToDate('-1','second').getTime()).toBe(-1000)
  expect(()=>timestampToDate('123','auto')).toThrow('指定')
  expect(()=>timestampToDate('9000000000000000','millisecond')).toThrow('范围')
  expect(()=>parseLocalDateTime('2026-02-30 12:00:00')).toThrow()
  const ts=dateToTimestamps(parseLocalDateTime('2024-02-29 12:34:56'))
  expect(Number(ts.millisecond)).toBeGreaterThan(0)
 })
 it('UUID v4 样式、数量与选项',()=>{
  const gen=()=> '550e8400-e29b-41d4-a716-446655440000'
  expect(generateUuids(2,true,true,gen)).toEqual(['550E8400E29B41D4A716446655440000','550E8400E29B41D4A716446655440000'])
  expect(()=>generateUuids(1001)).toThrow()
 })
 it('几何尺寸、不放大小图、cover 与 contain',()=>{
  expect(outputDimensions(640,480,'width',1200)).toEqual({width:640,height:480})
  expect(outputDimensions(640,480,'percent',50)).toEqual({width:320,height:240})
  const contain=fitRect(1600,900,200,200,'contain')
  expect(contain.dy).toBeGreaterThan(0)
  const cover=fitRect(1600,900,200,200,'cover')
  expect(cover.sw).toBeLessThan(1600)
  expect(()=>outputDimensions(640,480,'fixed',8192,8192)).toThrow()
 })
 it('PNG 多帧 ICO header/offset/256 的零字节约定',()=>{
  const png=(size:number)=>{
   const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10])
   new DataView(b.buffer).setUint32(16,size,false);new DataView(b.buffer).setUint32(20,size,false)
   return b
  }
  const ico=createIco([{size:16,png:png(16)},{size:256,png:png(256)}])
  const dv=new DataView(ico.buffer)
  expect(dv.getUint16(2,true)).toBe(1);expect(dv.getUint16(4,true)).toBe(2)
  expect(ico[6]).toBe(16);expect(ico[22]).toBe(0)
  expect(dv.getUint32(18,true)).toBe(38)
  expect(()=>createIco([{size:512,png:png(512)}])).toThrow()
 })
 it('ECDSA P-256 / P-384 密钥签名与验证',()=>{
  for(const curve of ['P-256','P-384'] as const){
   const kp=generateEc(curve),priv=createPrivateKey(kp.privateKey!),pub=createPublicKey(kp.publicKey!)
   const data=Buffer.from('ToolDock')
   const sig=sign('sha256',data,priv)
   expect(verify('sha256',data,pub,sig)).toBe(true)
  }
  const protectedKey=generateEc('P-256','correct-horse-battery')
  expect(protectedKey.privateKey).toContain('ENCRYPTED PRIVATE KEY')
 })
 it('随机串强制至少一类字符',()=>{
  const str=generateRandom(20,'abAB01',['ab','AB','01']).secret!
  expect(str).toMatch(/[ab]/);expect(str).toMatch(/[AB]/);expect(str).toMatch(/[01]/)
  expect(()=>generateRandom(1,'aA',['a','A'])).toThrow()
 })
})
