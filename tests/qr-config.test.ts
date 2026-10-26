import {describe,it,expect} from 'vitest'
import {QR_THEMES,QR_DOT_STYLES,QR_EYE_STYLES,defaultQrConfig,contrastRatio,qrPayload,validateQrConfig,effectiveEcc,toStylingOptions} from '../src/lib/qr/config'
import {assertSafeGeneratedSvg} from '../src/lib/qr/render'
describe('二维码主题、内容与风险安全',()=>{
 it('全部六主题具备强可读性',()=>{
  expect(QR_THEMES).toHaveLength(6)
  for(const t of QR_THEMES){
   expect(contrastRatio(t.dark,t.background)).toBeGreaterThanOrEqual(4.5)
   expect(contrastRatio(t.accent,t.background)).toBeGreaterThanOrEqual(4.5)
  }
 })
 it('模块与定位角样式齐全',()=>{
  expect(QR_DOT_STYLES).toHaveLength(6)
  expect(QR_EYE_STYLES).toHaveLength(3)
 })
 it('文本保留 Unicode、换行与边缘空格',()=>{
  const s=' 你好 🌈\n中文  '
  expect(qrPayload({...defaultQrConfig,kind:'text',text:s})).toBe(s)
 })
 it('网址仅 HTTP(S)，禁止携带身份凭据',()=>{
  expect(qrPayload({...defaultQrConfig,kind:'url',url:' https://example.com/path?x=1  '})).toBe('https://example.com/path?x=1')
  expect(()=>qrPayload({...defaultQrConfig,kind:'url',url:'javascript:alert(1)'})).toThrow()
  expect(()=>qrPayload({...defaultQrConfig,kind:'url',url:'https://u:p@example.com'})).toThrow()
 })
 it('UTF-8 大小限制按字节',()=>{
  expect(()=>qrPayload({...defaultQrConfig,kind:'text',text:'中'.repeat(301)})).toThrow('900')
 })
 it('纠错级别和尺寸边界',()=>{
  expect(effectiveEcc(defaultQrConfig)).toBe('Q')
  expect(effectiveEcc({...defaultQrConfig,withLogo:true})).toBe('H')
  expect(effectiveEcc({...defaultQrConfig,withLogo:true,eccAuto:false,ecc:'L'})).toBe('L')
  expect(validateQrConfig({...defaultQrConfig,size:128}).data).toContain('http')
  expect(validateQrConfig({...defaultQrConfig,size:2048}).data).toContain('http')
  expect(()=>validateQrConfig({...defaultQrConfig,size:2049})).toThrow()
  expect(()=>validateQrConfig({...defaultQrConfig,logoSize:.21})).toThrow()
  expect(toStylingOptions({...defaultQrConfig,withLogo:true}).qrOptions?.errorCorrectionLevel).toBe('H')
 })
 it('模块与定位角需分别过对比度',()=>{
  expect(()=>validateQrConfig({...defaultQrConfig,dark:'#eeeeee'})).toThrow()
  expect(()=>validateQrConfig({...defaultQrConfig,accent:'#fefefe'})).toThrow()
  expect(()=>validateQrConfig({...defaultQrConfig,accent:'#ffffff'})).toThrow()
 })
 it('SVG 禁止外链、脚本和 file 路径，允许嵌入 PNG',()=>{
  assertSafeGeneratedSvg('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="m1 2"/></svg>')
  assertSafeGeneratedSvg('<svg><image href="data:image/png;base64,aGVsbG8="/></svg>')
  expect(()=>assertSafeGeneratedSvg('<svg><script>alert(1)</script></svg>')).toThrow()
  expect(()=>assertSafeGeneratedSvg('<svg><image href="https://example.com/a.png"/></svg>')).toThrow()
 })
})
