import {afterEach,describe,expect,it,vi} from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {downloadAsset} from '../electron/main/services/media/model-download'

const roots:string[]=[]
const bytes=Buffer.from('test media model content across multiple segments')
const asset={id:'fixture',url:'https://example.com/model.bin',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}
async function target(){const root=await fs.mkdtemp(path.resolve('plans/download-test-'));roots.push(root);return path.join(root,'model.bin')}
afterEach(async()=>{vi.unstubAllGlobals();for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true})})
function server(options:{ignoreRanges?:boolean;corrupt?:boolean}={}){
 const calls:{url:string;range:string|null}[]=[]
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit={})=>{
  const headers=new Headers(init.headers),range=headers.get('range');calls.push({url,range})
  if(init.method==='HEAD')return new Response(null,{status:405})
  if(range){const [,a,b]=/bytes=(\d+)-(\d+)/.exec(range)!;const start=Number(a),end=Number(b)
   if(options.ignoreRanges&&range!=='bytes=0-0')return new Response(bytes,{status:200})
   const body=Buffer.from(bytes.subarray(start,end+1));if(options.corrupt)body.fill(0)
   return new Response(body,{status:206,headers:{'content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(body.length),etag:'"v1"'}})
  }
  return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}})
 }))
 return calls
}
describe('模型下载正确性',()=>{
 it('旧代理HEAD405仍能范围下载并核验全部字节',async()=>{const calls=server(),file=await target();await downloadAsset(asset,file,{acceleration:true,segments:4,signal:new AbortController().signal,update:()=>{}});expect(await fs.readFile(file)).toEqual(bytes);expect(calls.filter(c=>c.range&&c.range!=='bytes=0-0')).toHaveLength(4);expect(calls.every(c=>new URL(c.url).searchParams.get('url')===asset.url)).toBe(true)})
 it('Range被忽略时从头单连接重下而不拼接全文件到分段',async()=>{server({ignoreRanges:true});const file=await target();await downloadAsset(asset,file,{acceleration:false,segments:4,signal:new AbortController().signal,update:()=>{}});expect(await fs.readFile(file)).toEqual(bytes)})
 it('相同长度的损坏数据不会发布为模型',async()=>{server({corrupt:true});const file=await target();await expect(downloadAsset(asset,file,{acceleration:false,segments:4,signal:new AbortController().signal,update:()=>{}})).rejects.toThrow('SHA-256');expect(await fs.stat(file).catch(()=>null)).toBeNull()})
})
