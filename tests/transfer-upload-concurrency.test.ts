import {describe,it,expect,vi} from 'vitest'
import {unzipSync} from 'fflate'
import {createHash,randomBytes} from 'node:crypto'
import {existsSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const state={root:''}
vi.mock('electron',()=>({
 app:{getPath:()=>state.root,isPackaged:false},
 dialog:{},
 Notification:class{show(){}}
}))
vi.mock('../electron/main/database/store',()=>({
 getDb:()=>{throw Error('unused')},
 getDataRoot:()=>state.root
}))
vi.mock('../electron/main/database/file-transfer-history',()=>({
 saveShareHistory:()=>{}
}))

import {contiguousOffset,hasRangeOverlap,mergeRange,missingRanges,removeExactRange,sumRangeBytes} from '../electron/main/services/transfer/upload-chunks'
import {FileTransferService} from '../electron/main/services/transfer'

describe('上传分片区间工具',()=>{
 it('支持乱序插入、相邻合并与重叠检测',()=>{
  let ranges:[number,number][]=[]
  expect(hasRangeOverlap(ranges,0,100)).toBe(false)
  ranges=mergeRange(ranges,200,300)
  ranges=mergeRange(ranges,0,100)
  expect(ranges).toEqual([[0,100],[200,300]])
  expect(contiguousOffset(ranges)).toBe(100)
  expect(sumRangeBytes(ranges)).toBe(200)
  expect(hasRangeOverlap(ranges,50,150)).toBe(true)
  expect(hasRangeOverlap(ranges,100,200)).toBe(false)
  expect(missingRanges(ranges,350)).toEqual([[100,200],[300,350]])
  ranges=mergeRange(ranges,100,200)
  expect(ranges).toEqual([[0,300]])
  expect(contiguousOffset(ranges)).toBe(300)
  expect(missingRanges(ranges,350)).toEqual([[300,350]])
 })
 it('精确移除在途区间不影响其他区间',()=>{
  const inflight:[number,number][]=[[0,100],[200,300]]
  removeExactRange(inflight,0,100)
  expect(inflight).toEqual([[200,300]])
 })
})

describe('文件快传并发分片上传集成',()=>{
 it('支持乱序并发分片上传、句柄复用、校验合并与完整下载',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-concurrent-upload-'))
  state.root=temp
  const service=new FileTransferService()
  service.setPrefs({...service.getPrefs(),tempDirectory:temp,maxUploads:2})
  const nic=service.getInterfaces()[0]
  if(!nic){rmSync(temp,{recursive:true,force:true});return}
  try{
   const snapshot=await service.start(nic.address)
   const base=snapshot.url!
   const headers={'Origin':base,'X-ToolDock-Request':'1'}
   const auth=await fetch(base+'/api/auth',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({pin:snapshot.pin})})
   expect(auth.ok).toBe(true)
   const authData=await auth.json() as {token:string}
   const authed={...headers,'X-ToolDock-Pin':snapshot.pin!,'X-ToolDock-Device':authData.token}

   const payload=randomBytes(9*1024*1024+123)
   const createRes=await fetch(base+'/api/uploads',{method:'POST',headers:{...authed,'Content-Type':'application/json'},body:JSON.stringify({name:'concurrent.bin',size:payload.length,relativeFolder:'',group:''})})
   expect(createRes.status).toBe(201)
   const created=await createRes.json() as {id:string}

   const slices:[number,number][]=[[8*1024*1024,payload.length],[0,4*1024*1024],[4*1024*1024,8*1024*1024]]
   const putResults=await Promise.all(slices.map(async([start,end])=>{
    const chunk=payload.subarray(start,end)
    const digest=createHash('sha256').update(chunk).digest('hex')
    const r=await fetch(base+'/api/uploads/'+created.id+'?offset='+start,{method:'PUT',headers:{...authed,'X-Chunk-SHA256':digest,'Content-Type':'application/octet-stream'},body:chunk})
    return {status:r.status,body:await r.json()}
   }))
   expect(putResults.every(x=>x.status===200)).toBe(true)

   const stateRes=await fetch(base+'/api/uploads/'+created.id,{headers:{'X-ToolDock-Pin':snapshot.pin!}})
   const stateBody=await stateRes.json() as {offset:number;received:number;ranges:[number,number][]}
   expect(stateBody.offset).toBe(payload.length)
   expect(stateBody.received).toBe(payload.length)
   expect(stateBody.ranges).toEqual([[0,payload.length]])

   const completeRes=await fetch(base+'/api/uploads/'+created.id+'/complete',{method:'POST',headers:{...authed,'Content-Type':'application/json'},body:'{}'})
   expect(completeRes.status).toBe(200)
   const completed=await completeRes.json() as {poolId:string}

   const downRes=await fetch(base+'/api/pool/files/'+completed.poolId+'?pin='+encodeURIComponent(snapshot.pin!))
   expect(downRes.status).toBe(200)
   const downloaded=Buffer.from(await downRes.arrayBuffer())
   expect(createHash('sha256').update(downloaded).digest('hex')).toBe(createHash('sha256').update(payload).digest('hex'))
  }finally{
   await service.stop()
   rmSync(temp,{recursive:true,force:true})
  }
 })

 it('拒绝重叠区间与错误 SHA-256，支持中间区间断点续传与取消清理',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-resume-upload-'))
  state.root=temp
  const service=new FileTransferService()
  service.setPrefs({...service.getPrefs(),tempDirectory:temp,maxUploads:2})
  const nic=service.getInterfaces()[0]
  if(!nic){rmSync(temp,{recursive:true,force:true});return}
  try{
   const snapshot=await service.start(nic.address)
   const base=snapshot.url!
   const headers={'Origin':base,'X-ToolDock-Request':'1'}
   const auth=await fetch(base+'/api/auth',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({pin:snapshot.pin})})
   const authData=await auth.json() as {token:string}
   const authed={...headers,'X-ToolDock-Pin':snapshot.pin!,'X-ToolDock-Device':authData.token}

   const payload=randomBytes(1024*1024)
   const createRes=await fetch(base+'/api/uploads',{method:'POST',headers:{...authed,'Content-Type':'application/json'},body:JSON.stringify({name:'resume.bin',size:payload.length,relativeFolder:'',group:''})})
   const created=await createRes.json() as {id:string}

   const secondHalf=payload.subarray(512*1024)
   const r1=await fetch(base+'/api/uploads/'+created.id+'?offset='+(512*1024),{method:'PUT',headers:{...authed,'X-Chunk-SHA256':createHash('sha256').update(secondHalf).digest('hex'),'Content-Type':'application/octet-stream'},body:secondHalf})
   expect(r1.status).toBe(200)

   // 重叠分片应被拒绝
   const overlap=payload.subarray(256*1024,768*1024)
   const rOverlap=await fetch(base+'/api/uploads/'+created.id+'?offset='+(256*1024),{method:'PUT',headers:{...authed,'X-Chunk-SHA256':createHash('sha256').update(overlap).digest('hex'),'Content-Type':'application/octet-stream'},body:overlap})
   expect(rOverlap.status).toBe(409)

   // 错误 SHA-256 应被拒绝，且不污染已有区间
   const firstHalf=payload.subarray(0,512*1024)
   const rBadHash=await fetch(base+'/api/uploads/'+created.id+'?offset=0',{method:'PUT',headers:{...authed,'X-Chunk-SHA256':'0'.repeat(64),'Content-Type':'application/octet-stream'},body:firstHalf})
   expect(rBadHash.ok).toBe(false)

   const midState=await (await fetch(base+'/api/uploads/'+created.id,{headers:{'X-ToolDock-Pin':snapshot.pin!}})).json() as {offset:number;received:number;ranges:[number,number][]}
   expect(midState.offset).toBe(0)
   expect(midState.received).toBe(512*1024)
   expect(midState.ranges).toEqual([[512*1024,payload.length]])

   // 取消上传并确认临时文件已清理
   const delRes=await fetch(base+'/api/uploads/'+created.id,{method:'DELETE',headers:authed})
   expect(delRes.status).toBe(200)
   const tempSession=service.getSnapshot()
   expect(tempSession.pool.fileCount).toBe(0)
   expect(existsSync(path.join(temp,created.id+'.part'))).toBe(false)
  }finally{
   await service.stop()
   rmSync(temp,{recursive:true,force:true})
  }
 })

 it('批量与文件夹打包下载支持 HEAD 探测与系统下载器无 Cookie 二次 GET 拉取',async()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'tooldock-zip-ticket-'))
  const shareFolder=path.join(temp,'shared-folder')
  mkdirSync(shareFolder)
  writeFileSync(path.join(shareFolder,'hello.txt'),'zip-content')
  state.root=temp
  const service=new FileTransferService()
  service.setPrefs({...service.getPrefs(),tempDirectory:temp})
  const nic=service.getInterfaces()[0]
  if(!nic){rmSync(temp,{recursive:true,force:true});return}
  try{
   const snapshot=await service.start(nic.address)
   await service.addSources([shareFolder])
   await service.addPoolSources([shareFolder])
   const shareId=service.getSnapshot().shares[0].id
   const base=snapshot.url!
   const headers={'Origin':base,'X-ToolDock-Request':'1','X-ToolDock-Pin':snapshot.pin!}

   // 1. 分享文件夹打包：HEAD 探测 + 连续两次无设备 token GET 均应成功
   const shareTicketRes=await fetch(base+'/api/archive-selections',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({ids:[shareId]})})
   expect(shareTicketRes.status).toBe(201)
   const shareTicket=await shareTicketRes.json() as {url:string}
   const shareZipUrl=base+shareTicket.url+'?pin='+encodeURIComponent(snapshot.pin!)
   expect((await fetch(shareZipUrl,{method:'HEAD'})).status).toBe(200)
   const firstGet=await fetch(shareZipUrl)
   expect(firstGet.status).toBe(200)
   const shareBuf=new Uint8Array(await firstGet.arrayBuffer())
   expect(Number(firstGet.headers.get('content-length'))).toBe(shareBuf.byteLength)
   expect(new TextDecoder().decode(unzipSync(shareBuf)['shared-folder/hello.txt'])).toBe('zip-content')
   const secondGet=await fetch(shareZipUrl)
   expect(secondGet.status).toBe(200)
   expect((await secondGet.arrayBuffer()).byteLength).toBe(shareBuf.byteLength)

   // 2. 文件池打包：HEAD 探测 + 连续两次无设备 token GET 均应成功且带精确 Content-Length
   const poolTicketRes=await fetch(base+'/api/pool/archive',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({ids:[]})})
   expect(poolTicketRes.status).toBe(201)
   const poolTicket=await poolTicketRes.json() as {url:string}
   const poolZipUrl=base+poolTicket.url+'?pin='+encodeURIComponent(snapshot.pin!)
   expect((await fetch(poolZipUrl,{method:'HEAD'})).status).toBe(200)
   const poolGet=await fetch(poolZipUrl)
   expect(poolGet.status).toBe(200)
   const poolBuf=new Uint8Array(await poolGet.arrayBuffer())
   expect(Number(poolGet.headers.get('content-length'))).toBe(poolBuf.byteLength)
   expect(new TextDecoder().decode(unzipSync(poolBuf)['shared-folder/hello.txt'])).toBe('zip-content')
   expect((await fetch(poolZipUrl)).status).toBe(200)

   // 3. /api/zip 全量打包支持 HEAD
   expect((await fetch(base+'/api/zip?pin='+encodeURIComponent(snapshot.pin!),{method:'HEAD'})).status).toBe(200)
  }finally{
   await service.stop()
   rmSync(temp,{recursive:true,force:true})
  }
 })
})
