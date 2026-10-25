import {describe,it,expect} from 'vitest'
import {encodeBase64,decodeBase64} from '../src/lib/base64'
describe('Base64 严格 UTF-8 编解码',()=>{
 it('中文、Emoji、换行和 ASCII 往返',()=>{
  for(const s of ['你好😀 ToolDock','Hello World!','A\r\nB',''])expect(decodeBase64(encodeBase64(s))).toBe(s)
 })
 it('标准 / URL Safe 字母表和填充',()=>{
  const s='Hello??~你好'
  expect(decodeBase64(encodeBase64(s,'standard',true),'standard')).toBe(s)
  expect(decodeBase64(encodeBase64(s,'url',false),'url')).toBe(s)
  expect(encodeBase64('f','standard',true)).toBe('Zg==')
  expect(encodeBase64('f','url',false)).toBe('Zg')
  expect(decodeBase64('Z\ng==')).toBe('f')
 })
 it('错误输入拒绝而非产生乱码',()=>{
  for(const input of ['Z','=','Zg=','Zg===','Zm9v?','Zg==Zg','_+/A'])expect(()=>decodeBase64(input)).toThrow()
  expect(()=>decodeBase64('/w==','standard')).toThrow('UTF-8')
  expect(()=>decodeBase64('Zh==','standard')).toThrow('非规范')
  expect(()=>decodeBase64('Zg-','standard')).toThrow()
  expect(()=>decodeBase64('Zg+','url')).toThrow()
 })
 it('自动识别显著不同字母表',()=>{
  expect(()=>decodeBase64('_w','auto')).toThrow('UTF-8')
  expect(decodeBase64('SGVsbG8','auto')).toBe('Hello')
 })
})
