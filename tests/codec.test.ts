import {describe,expect,it} from 'vitest'
import {convertText} from '../src/lib/codec'
import {runPipeline} from '../src/lib/codec/execute'
import {makeStep,pipelineExportSchema,pipelineInputSchema,type CodecStep} from '../src/shared/codecModels'
const step=(kind:CodecStep['kind'],direction:CodecStep['direction']='encode',options:Record<string,unknown>={})=>({...makeStep(kind,direction),options:{...makeStep(kind,direction).options,...options}}) as CodecStep
const enc=(kind:CodecStep['kind'],value:string,options:Record<string,unknown>={})=>convertText(value,step(kind,'encode',options))
const dec=(kind:CodecStep['kind'],value:string,options:Record<string,unknown>={})=>convertText(value,step(kind,'decode',options))
describe('编解码 · 七类严格 UTF-8 转换',()=>{
 it('URL component/uri/form 及坏百分号',()=>{
  expect(enc('url','a b&=你好')).toBe('a%20b%26%3D%E4%BD%A0%E5%A5%BD')
  expect(enc('url','https://a.test/?a=b c',{mode:'uri'})).toBe('https://a.test/?a=b%20c')
  expect(enc('url','a b+c',{mode:'form'})).toBe('a+b%2Bc')
  expect(dec('url','a+b%2Bc',{mode:'form'})).toBe('a b+c')
  expect(dec('url','a+b')).toBe('a+b')
  expect(()=>dec('url','%E4%BD')).toThrow()
  expect(()=>dec('url','%ZZ')).toThrow()
 })
 it('Unicode JS/ES6/U+ 往返与代理项验证',()=>{
  const s='你好😀\\u0041\n'
  for(const format of ['js','es6','codepoint'] as const)expect(dec('unicode',enc('unicode',s,{format}),{format})).toBe(s)
  expect(enc('unicode','😀',{format:'js'})).toBe('\\uD83D\\uDE00')
  expect(enc('unicode','😀',{format:'es6'})).toBe('\\u{1F600}')
  expect(dec('unicode','U+4F60 U+597D',{format:'codepoint'})).toBe('你好')
  for(const x of ['\\uD800','\\uDE00','\\uD800\\u0041','\\uGGGG'])expect(()=>dec('unicode',x)).toThrow()
  expect(()=>dec('unicode','\\u{110000}',{format:'es6'})).toThrow()
  expect(()=>enc('unicode','\uD800')).toThrow()
 })
 it('Hex 四种表示及非法二进制拒绝',()=>{
  const s='你好😀'
  for(const format of ['space','compact','0x','slash-x'] as const)expect(dec('hex',enc('hex',s,{format}))).toBe(s)
  expect(enc('hex','A',{format:'space'})).toBe('41')
  expect(enc('hex','A',{format:'slash-x'})).toBe('\\x41')
  expect(dec('hex','0x41 0x42')).toBe('AB')
  for(const s of ['0','0G','0x1','\\x4','41 4','FF'])expect(()=>dec('hex',s)).toThrow()
 })
 it('HTML Entities 标准/数字/多字符实体',()=>{
  const s='<A x="你好">&\''
  expect(enc('html-entity',s)).toContain('&lt;A')
  for(const format of ['basic','decimal','hex'] as const)expect(dec('html-entity',enc('html-entity',s,{format}))).toBe(s)
  expect(dec('html-entity','&NotEqualTilde;')).toBe('≂̸')
  expect(dec('html-entity','&amp;amp;')).toBe('&amp;')
  expect(()=>dec('html-entity','&#x110000;')).toThrow()
 })
 it('JSON Escape 是完整 JSON 字符串字面量',()=>{
  expect(enc('json-escape','')).toBe('""')
  expect(dec('json-escape',enc('json-escape','"A"\n你好😀'))).toBe('"A"\n你好😀')
  expect(()=>dec('json-escape','{"a":1}')).toThrow()
  expect(()=>dec('json-escape','"\\uGGGG"')).toThrow()
 })
 it('Binary 是 UTF-8 八位字节，不是码点二进制',()=>{
  expect(enc('binary','A中')).toBe('01000001 11100100 10111000 10101101')
  expect(dec('binary',enc('binary','你好😀',{format:'compact'}))).toBe('你好😀')
  expect(()=>dec('binary','11111111')).toThrow()
  expect(()=>dec('binary','101')).toThrow()
 })
 it('Base64 兼容严格解码、URL Safe 与坏 UTF-8',()=>{
  const s='你好😀'
  expect(dec('base64',enc('base64',s))).toBe(s)
  expect(dec('base64',enc('base64',s,{variant:'url',padded:false}),{variant:'auto'})).toBe(s)
  expect(()=>dec('base64','Zh==')).toThrow('非规范')
  expect(()=>dec('base64','/w==')).toThrow('UTF-8')
  expect(()=>pipelineInputSchema.parse({name:'a',description:'',steps:[step('base64','encode',{variant:'auto'})]})).toThrow()
 })
})
describe('多步流水线与安全契约',()=>{
 it('正向往返、按序执行，错误停止后续步骤',()=>{
  const a=[step('url'),step('base64'),step('base64','decode'),step('url','decode')]
  expect(runPipeline('你好 &',a).finalValue).toBe('你好 &')
  const b=[step('url'),step('hex','decode'),step('base64')]
  const r=runPipeline('abc',b)
  expect(r.finalValue).toBeNull()
  expect(r.error?.index).toBe(1)
  expect(r.stages.map(s=>s.status)).toEqual(['ok','error','not-run'])
 })
 it('禁用步骤 passthrough，选择中间结果正确',()=>{
  const a=step('url'),b=step('base64');b.enabled=false
  const r=runPipeline('a b',[a,b],a.id)
  expect(r.finalValue).toBe('a%20b');expect(r.selectedValue).toBe('a%20b')
  expect(r.stages[1].status).toBe('skipped')
 })
 it('长度、步骤数量和配置结构严格限制',()=>{
  expect(()=>runPipeline('A'.repeat(2*1024*1024+1),[])).toThrow('2 MiB')
  expect(()=>runPipeline('x',Array.from({length:21},()=>step('url')))).toThrow('20')
  const a=step('base64')
  expect(()=>pipelineInputSchema.parse({name:'A',description:'',steps:[a,a]})).toThrow()
  expect(()=>pipelineExportSchema.parse({format:'tooldock.codec-pipeline',version:1,pipeline:{name:'Hi',description:'',steps:[a],input:'secret'}})).toThrow()
  expect(()=>runPipeline('A'.repeat(1024*1024),[step('binary')])).toBeDefined()
 })
})
