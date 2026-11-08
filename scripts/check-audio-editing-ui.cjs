const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os')
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{_electron}=require('playwright-core')
async function main(){
 const root=path.resolve(__dirname,'..'),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'tooldock-audio-ui-'))
 const ffmpeg=path.join(root,'resources/media/bin/ffmpeg/ffmpeg.exe'),video=path.join(tmp,'smoke.mp4')
 execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x90:r=24:d=4',
  '-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','mpeg4','-c:a','aac','-shortest','-n',video],{timeout:30000})
 const original=await fs.stat(video)
 let app
 try{
  app=await _electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),
   args:[path.join(root,'out/main/index.js')],env:{...process.env,TOOLDOCK_E2E_APPDATA:path.join(tmp,'userdata'),ELECTRON_RENDERER_URL:''},timeout:30000})
  const first=await app.firstWindow()
  const page=app.windows().find(w=>w.url().includes('out/renderer/index.html'))||first
  await page.waitForFunction(()=>!!window.toolDock?.audio,null,{timeout:20000})
  await page.getByText('视频处理',{exact:true}).first().click({timeout:15000})
  await page.getByRole('tab',{name:'提取音频'}).click()
  await page.getByRole('heading',{name:'音频工程'}).waitFor()
  const imported=await page.evaluate(paths=>window.toolDock.audio.addSources(paths),[video])
  assert.equal(imported.added,1,JSON.stringify(imported))
  let status=await page.evaluate(()=>window.toolDock.audio.status())
  assert.equal(status.projects.length,1)
  const p=status.projects[0]
  await page.getByRole('button',{name:'编辑',exact:true}).first().click()
  await page.getByRole('textbox',{name:'剪辑秒数'}).fill('1')
  await page.getByRole('button',{name:'删除前N秒'}).click()
  for(let i=0;i<80;i++){
   status=await page.evaluate(()=>window.toolDock.audio.status())
   if(status.projects[0]?.edit.kept[0].startUs===1_000_000)break
   await new Promise(resolve=>setTimeout(resolve,150))
  }
  assert.equal(status.projects[0].edit.kept[0].startUs,1_000_000)
  await page.getByRole('button',{name:'导出',exact:true}).click()
  const dlg=page.getByRole('dialog',{name:/导出音频/})
  await dlg.getByRole('button',{name:'开始导出'}).click()
  for(let i=0;i<240;i++){
   status=await page.evaluate(()=>window.toolDock.audio.status())
   if(status.jobs[0]&&['completed','failed'].includes(status.jobs[0].state))break
   await new Promise(resolve=>setTimeout(resolve,150))
  }
  assert.equal(status.jobs[0].state,'completed',status.jobs[0].error)
  assert.ok((await fs.stat(status.jobs[0].outputPath)).size>1000)
  assert.equal((await fs.stat(video)).size,original.size)
  console.log('AUDIO_UI_SMOKE_PASS',JSON.stringify({projects:status.projects.length,revision:status.projects[0].revision,job:status.jobs[0].state}))
 }finally{
  if(app)await app.close().catch(()=>{})
  await fs.rm(tmp,{recursive:true,force:true}).catch(()=>{})
 }
}
main().catch(e=>{console.error(e);process.exitCode=1})
