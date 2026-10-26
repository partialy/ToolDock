import {describe,expect,it} from 'vitest'
import {compareDocuments,DIFF_MAX_BYTES} from '../src/lib/diff/compare'

describe('文本差异对比',()=>{
 it('左右一致时没有差异',()=>{
  const r=compareDocuments('alpha\nbeta','alpha\nbeta','text')
  expect(r.blocks).toHaveLength(0)
  expect(r.rows.every(x=>x.kind==='equal')).toBe(true)
 })
 it('新增、删除、修改均对齐且定位块有效',()=>{
  const r=compareDocuments('one\nold\nkeep\nremoved\nend','one\nnew\nkeep\nend\nadded','text')
  expect(r.modified).toBe(1)
  expect(r.removed).toBe(1)
  expect(r.added).toBe(1)
  expect(r.blocks).toHaveLength(3)
  expect(r.rows.filter(x=>x.kind==='modified')[0]).toMatchObject({leftText:'old',rightText:'new',leftNumber:2,rightNumber:2})
  expect(r.rows.filter(x=>x.kind==='added')[0].leftNumber).toBeNull()
 })
 it('处理空字符串、末尾换行、CRLF 和大段相同内容',()=>{
  expect(compareDocuments('','','text').blocks).toHaveLength(0)
  expect(compareDocuments('a\r\nb','a\nb','text').blocks).toHaveLength(0)
  expect(compareDocuments('a\n','a','text').blocks).toHaveLength(1)
  const r=compareDocuments(Array(1500).fill('same').join('\n'),'diff\n'+Array(1500).fill('same').join('\n'),'text')
  expect(r.added).toBe(1)
 })
 it('差异非常多时保守地显示整段变化，不丢行',()=>{
  const a=Array.from({length:450},(_,i)=>'old'+i).join('\n')
  const b=Array.from({length:450},(_,i)=>'new'+i).join('\n')
  const r=compareDocuments(a,b,'text')
  expect(r.rows.filter(x=>x.leftNumber!==null)).toHaveLength(450)
  expect(r.rows.filter(x=>x.rightNumber!==null)).toHaveLength(450)
  expect(r.blocks).toHaveLength(1)
 })
})
describe('JSON 安全结构对比',()=>{
 it('忽略对象键顺序，包含嵌套对象和数字原文',()=>{
  const a='{"z":9007199254740993,"a":{"y":1e+30,"x":-0}}'
  const b='{"a":{"x":-0,"y":1e+30},"z":9007199254740993}'
  const r=compareDocuments(a,b,'json',true)
  expect(r.blocks).toHaveLength(0)
  expect(r.leftDisplay).toContain('9007199254740993')
  expect(r.rightDisplay).toContain('1e+30')
  expect(compareDocuments(a,b,'json',false).blocks.length).toBeGreaterThan(0)
 })
 it('数组顺序依旧敏感，空白差异不影响结果',()=>{
  const a='{"a":[1,2],"b":3}'
  const b=' { "b": 3, "a": [2,1] } '
  expect(compareDocuments(a,b,'json',true).blocks.length).toBeGreaterThan(0)
  expect(compareDocuments('{"a": 1}', '{\n  "a":1\n}','json').blocks).toHaveLength(0)
 })
 it('拒绝重复键和非法 JSON，不把精度敏感数据转成 JS Number',()=>{
  expect(()=>compareDocuments('{"a":1,"a":2}','{"a":2}','json',true)).toThrow('重复 Key')
  expect(()=>compareDocuments('{bad}','{}','json')).toThrow('左侧 JSON 语法错误')
  expect(()=>compareDocuments('{}','{"a":}','json')).toThrow('右侧 JSON 语法错误')
 })
 it('限制超大文档和过多行',()=>{
  expect(()=>compareDocuments('x'.repeat(DIFF_MAX_BYTES+1),'a','text')).toThrow('2 MiB')
  expect(()=>compareDocuments('x\n'.repeat(10001),'b','text')).toThrow('10000')
 })
})
