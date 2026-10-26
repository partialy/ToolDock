import {describe,it,expect} from 'vitest'
import {isPrivateIpv4,sameSubnet,safeFilename} from '../electron/main/services/transfer/network'
import {LanAuth} from '../electron/main/services/transfer/auth'
describe('局域网服务网络与会话安全',()=>{
 it('只接受 RFC1918 私有 IPv4，拒绝公网与回环',()=>{
  expect(isPrivateIpv4('192.168.9.100')).toBe(true)
  expect(isPrivateIpv4('10.2.3.4')).toBe(true)
  expect(isPrivateIpv4('172.16.8.7')).toBe(true)
  expect(isPrivateIpv4('172.31.255.254')).toBe(true)
  expect(isPrivateIpv4('172.32.1.1')).toBe(false)
  expect(isPrivateIpv4('8.8.8.8')).toBe(false)
  expect(isPrivateIpv4('127.0.0.1')).toBe(false)
 })
 it('网络来源地址受真实网卡掩码约束',()=>{
  expect(sameSubnet('192.168.9.100','255.255.255.0','192.168.9.44')).toBe(true)
  expect(sameSubnet('192.168.9.100','255.255.255.0','192.168.8.44')).toBe(false)
  expect(sameSubnet('192.168.9.100','255.255.255.0','::ffff:192.168.9.44')).toBe(true)
 })
 it('文件名不能通过路径穿越或 Windows 设备名注入',()=>{
  expect(safeFilename('../../secret.txt')).toBe('secret.txt')
  expect(safeFilename('..\\folder\\foo.jpg')).toBe('foo.jpg')
  expect(safeFilename('CON.txt')).not.toBe('CON.txt')
  expect(safeFilename('file.txt \t')).toBe('file.txt')
 })
 it('6 位访问码与 QR token 每次会话随机、失败/撤销不可复用',()=>{
  const a=new LanAuth(),b=new LanAuth()
  expect(a.pin).toMatch(/^[0-9]{6}$/)
  expect(a.bootstrap).not.toBe(b.bootstrap)
  expect(()=>a.authorize('pin','1111111','192.168.9.100','chrome')).toThrow()
  const device=a.authorize('token',a.bootstrap,'192.168.9.100','android')
  expect(a.list()).toHaveLength(1)
  expect(a.cookieFor(device.id)).toContain('HttpOnly')
  a.revoke(device.id)
  expect(a.list()).toHaveLength(0)
 })
})
