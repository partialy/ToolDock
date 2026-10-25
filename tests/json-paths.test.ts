import {describe,it,expect} from 'vitest'
import {childJsonPath} from '../src/lib/json/paths'
describe('JSONPath 输出',()=>{
 it('基本键、特殊键、数组索引',()=>{
  expect(childJsonPath('$.user','roles')).toBe('$.user.roles')
  expect(childJsonPath('$.user.roles',0)).toBe('$.user.roles[0]')
  expect(childJsonPath('$','first-name')).toBe('$["first-name"]')
  expect(childJsonPath('$','a"b')).toBe('$["a\\"b"]')
 })
})
