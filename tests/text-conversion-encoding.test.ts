import {describe,it,expect} from 'vitest'
import iconv from 'iconv-lite'
import {decodeInput,encodeOutput} from '../electron/main/services/text-conversion/encoding'
describe('简繁转换编码',()=>{
 it('保留 UTF-8 BOM 和 CRLF',()=>{
  const bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('繁體\r\n')])
  const src=decodeInput(bytes,'auto')
  expect(src.encoding).toBe('utf8')
  expect(src.text).toBe('繁體\r\n')
  expect(encodeOutput('繁体\r\n',src,'preserve')).toEqual(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('繁体\r\n')]))
 })
 it('GB18030 和 Big5 可指定编码解码，不能无声替换字符',()=>{
  const gb=decodeInput(iconv.encode('繁體測試','gb18030'),'gb18030')
  expect(gb.text).toBe('繁體測試')
  expect(encodeOutput('繁体测试',gb,'preserve')).toEqual(iconv.encode('繁体测试','gb18030'))
  const big5=decodeInput(iconv.encode('繁體測試','big5'),'big5')
  expect(big5.text).toBe('繁體測試')
  expect(()=>encodeOutput('繁体测试',big5,'preserve')).toThrow('无法以 big5 无损保存')
  expect(encodeOutput('繁体测试',big5,'utf8').toString('utf8')).toBe('繁体测试')
 })
 it('非法 UTF-8 不产生乱码',()=>{
  expect(()=>decodeInput(Buffer.from([0xc0,0xaf]),'utf8')).toThrow()
 })
})
