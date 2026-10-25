import {describe,it,expect} from 'vitest'
import {transformJson} from '../src/lib/json/transform'
describe('无损 JSON 操作',()=>{
 const src='{"orderId":9007199254740993,"value":1234567890.1234567890123456789,"minus":-0,"exp":1e+30,"nested":{"z":1,"a":2}}'
 it('格式化/压缩保留大整数、小数、科学计数法字面量',()=>{
  const f=transformJson(src,'format','4')
  for(const token of ['9007199254740993','1234567890.1234567890123456789','-0','1e+30'])expect(f).toContain(token)
  expect(transformJson(f,'compact')).toBe(src)
  expect(transformJson(src,'format','tab')).toContain('\t')
 })
 it('排序只改变对象键顺序，不改变数组排列与数值文本',()=>{
  const sorted=transformJson('{"z":[2,1],"a":{"z":9007199254740993,"a":1}}','sort')
  expect(sorted.indexOf('"a"')).toBeLessThan(sorted.indexOf('"z"'))
  expect(sorted).toContain('[\n    2,\n    1\n  ]')
  expect(sorted).toContain('9007199254740993')
 })
 it('重复 Key 拒绝危险转换',()=>{
  expect(()=>transformJson('{"a":1,"a":2}','format')).toThrow('重复')
  expect(()=>transformJson('{"a":1,"a":2}','sort')).toThrow('重复')
 })
 it('标准 JSON 字符串字面量转义与单层反转义',()=>{
  const raw='{"name":"你好"}\n'
  const encoded=transformJson(raw,'escape')
  expect(encoded).toBe(JSON.stringify(raw))
  expect(transformJson(encoded,'unescape')).toBe(raw)
  expect(()=>transformJson('{"a":1}','unescape')).toThrow()
  expect(()=>transformJson('"bad\\uZZZZ"','unescape')).toThrow()
 })
})
