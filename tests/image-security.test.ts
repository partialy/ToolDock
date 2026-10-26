import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMParser,XMLSerializer} from '@xmldom/xmldom'
import {sanitizeSvg} from '../src/lib/image/svg-safety'
import {safeStem,verifyMagic,validateImageFile} from '../src/lib/image/file-validation'
beforeEach(()=>{vi.stubGlobal('DOMParser',DOMParser);vi.stubGlobal('XMLSerializer',XMLSerializer)})
afterEach(()=>vi.unstubAllGlobals())
describe('SVG 安全输入和文件验证',()=>{
 it('允许基本内联图形，保留视图盒与填色',()=>{
  const safe=sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="red"/></svg>')
  expect(safe).toContain('viewBox');expect(safe).toContain('<rect')
 })
 it('拒绝外链、SVG 脚本、事件和不受信任的子树',()=>{
  const wrap=(body:string)=>'<svg xmlns="http://www.w3.org/2000/svg">'+body+'</svg>'
  for(const body of [
   '<script>alert(1)</script>','<rect onload="alert(1)" width="20" height="20"/>',
   '<foreignObject><div>evil</div></foreignObject>',
   '<image href="https://evil.test/x.png"/>',
   '<rect fill="url(https://evil.test/a.svg)"/>'
  ])expect(()=>sanitizeSvg(wrap(body))).toThrow()
  expect(()=>sanitizeSvg('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow()
 })
 it('文件名称、图片魔数与可疑扩展名',()=>{
  expect(safeStem('../../evil?.png')).not.toMatch(/[/\\?]/)
  const png=new Uint8Array([137,80,78,71,13,10,26,10])
  expect(verifyMagic(png,'image/png')).toBe(true)
  expect(verifyMagic(png,'image/jpeg')).toBe(false)
  expect(()=>validateImageFile(new File(['abc'],'file.svg',{type:'image/svg+xml'}),false)).toThrow()
 })
})
