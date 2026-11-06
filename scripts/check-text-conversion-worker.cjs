const fs=require('node:fs/promises')
const path=require('node:path')
const os=require('node:os')
const assert=require('node:assert/strict')
const {Worker}=require('node:worker_threads')
const iconv=require('iconv-lite')
async function runWorker(options){
 const file=path.join(__dirname,'../out/main/text-conversion-worker.js')
 await fs.access(file)
 return new Promise((resolve,reject)=>{
  let ended=false
  const worker=new Worker(file,{workerData:options})
  worker.on('message',data=>{
   if(data.error&&!ended){ended=true;reject(Error(data.error))}
   else if(data.done&&!ended){ended=true;resolve(data)}
  })
  worker.on('error',reject)
  worker.on('exit',code=>{if(!ended)reject(Error('Worker exited '+code))})
 })
}
async function main(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tooldock-conversion-e2e-'))
 try{
  const prefs={direction:'simplify',region:'general',phraseConversion:false,suffix:'',inputEncoding:'auto',outputEncoding:'preserve'}
  const srt=path.join(root,'sample.srt'),output=path.join(root,'out.srt.part')
  await fs.writeFile(srt,'1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>繁體字幕</i>\r\n','utf8')
  const info=await runWorker({inputPath:srt,outputPath:output,settings:prefs,encoding:'auto'})
  const result=await fs.readFile(output,'utf8')
  assert.equal(result,'1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>繁体字幕</i>\r\n')
  assert.equal(info.encoding,'utf8')
  const traditional=path.join(root,'traditional.txt'),big5out=path.join(root,'big5.part')
  await fs.writeFile(traditional,iconv.encode('繁體測試\r\n','big5'))
  await assert.rejects(runWorker({inputPath:traditional,outputPath:big5out,settings:prefs,encoding:'big5'}),/无法以 big5 无损保存/)
  await runWorker({inputPath:traditional,outputPath:big5out,settings:{...prefs,outputEncoding:'utf8'},encoding:'big5'})
  assert.equal(await fs.readFile(big5out,'utf8'),'繁体测试\r\n')
  console.log('WORKER_RUNTIME_PASSED: SRT + Big5 input / safe UTF-8 output, out/main worker, native Worker thread')
 }finally{await fs.rm(root,{recursive:true,force:true})}
}
main().catch(e=>{console.error(e);process.exitCode=1})
