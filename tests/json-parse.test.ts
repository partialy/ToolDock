import {describe,it,expect} from 'vitest'
import {parseStrictJson,jsonLineCol} from '../src/lib/json/parse'
describe('严格 JSON',()=>{
 it('合法根数据类型',()=>{
  for(const source of ['{}','[]','null','true','false','123','"abc"','{"a":[1]}'])expect(parseStrictJson(source).valid).toBe(true)
 })
 it('拒绝 JSONC、JSON5 和非法数据',()=>{
  for(const source of ['{a:1}',"{'a':1}",'{"a":1,}','{/* x */"a":1}','NaN','undefined','{"a": Infinity}',''])expect(parseStrictJson(source).valid).toBe(false)
 })
 it('同层重复 Key 和 Unicode 等价转义检测',()=>{
  const a=parseStrictJson('{"a":1,"\\u0061":2}')
  expect(a.valid).toBe(true)
  expect(a.duplicateKeys).toHaveLength(1)
  expect(parseStrictJson('{"a":1,"nested":{"a":2}}').duplicateKeys).toHaveLength(0)
 })
 it('错误 offset 可转换为实际行列',()=>{
  expect(jsonLineCol('a\r\nb\nfoo',6)).toEqual({line:3,column:2})
 })
})
