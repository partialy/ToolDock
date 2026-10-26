import {describe,expect,it} from 'vitest'
import {unzipSync} from 'fflate'
import {zipToSink} from '../src/lib/export/zip-stream'
describe('ZIP 流式打包',()=>{
 it('多文件可解压并保留内容',async()=>{
  const chunks:Uint8Array[]=[]
  await zipToSink([
   {name:'logo/logo.ico',blob:new Blob([new Uint8Array([1,2,3])])},
   {name:'picture.png',blob:new Blob(['hello zip'])}
  ],async chunk=>{chunks.push(chunk)})
  const size=chunks.reduce((n,c)=>n+c.length,0),zip=new Uint8Array(size)
  let offset=0
  for(const c of chunks){zip.set(c,offset);offset+=c.length}
  const files=unzipSync(zip)
  expect(Array.from(files['logo/logo.ico'])).toEqual([1,2,3])
  expect(new TextDecoder().decode(files['picture.png'])).toBe('hello zip')
 })
 it('取消时抛出错误，不能继续写入',async()=>{
  await expect(zipToSink([{name:'a.txt',blob:new Blob(['hello'])}],async()=>{},()=>true)).rejects.toThrow('取消')
 })
})
