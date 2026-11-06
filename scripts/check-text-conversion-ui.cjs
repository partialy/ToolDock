const fs=require('node:fs/promises')
const path=require('node:path')
const os=require('node:os')
const assert=require('node:assert/strict')
const {_electron}=require('playwright-core')
async function main(){
 const root=path.resolve(__dirname,'..')
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'tooldock-textconv-electron-'))
 const file=path.join(tmp,'demo.srt')
 await fs.writeFile(file,'1\r\n00:00:01,000 --> 00:00:02,000\r\n繁體字幕\r\n')
 let app
 try{
  app=await _electron.launch({
   executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),
   args:[path.join(root,'out/main/index.js')],
   env:{...process.env,TOOLDOCK_E2E_APPDATA:path.join(tmp,'userdata'),ELECTRON_RENDERER_URL:''},
   timeout:30000
  })
  const first=await app.firstWindow()
  await new Promise(resolve=>setTimeout(resolve,1800))
  console.log('WINDOWS',await Promise.all(app.windows().map(async w=>({title:await w.title(),url:w.url()}))))
  const win=app.windows().find(w=>w.url().includes('out/renderer/index.html'))||first
  console.log('SELECTED_WINDOW',win.url(),(await win.locator('body').innerText().catch(()=>'' )).slice(0,250))
  await win.waitForLoadState('domcontentloaded')
  await win.waitForFunction(()=>!!window.toolDock?.textConversion,{timeout:15000})
  console.log('ELECTRON_IPC_READY')
  const names=await win.locator('body').innerText()
  console.log('STARTUP_CONTENT',names.slice(0,180).replace(/\s+/g,' '))
  await win.getByText('视频处理',{exact:true}).first().click({timeout:15000})
  await win.getByRole('tab',{name:'简繁转换'}).click({timeout:15000})
  assert.equal(await win.getByRole('heading',{name:'文本转换'}).count(),1)
  assert.equal(await win.getByRole('heading',{name:/文件转换/}).count(),1)
  await win.getByPlaceholder('粘贴需要转换的中文内容...').fill('繁體轉換')
  await win.getByRole('button',{name:'转换',exact:true}).click()
  await win.waitForFunction(()=>document.querySelector('textarea[readonly]')?.value.includes('繁体转换'),null,{timeout:20000})
  console.log('TEXT_WORKER_UI_PASSED')
  const imported=await win.evaluate(async file=>{
   return window.toolDock.textConversion.addSources([file])
  },file)
  assert.equal(imported.added,1)
  const tasks=await win.evaluate(()=>window.toolDock.textConversion.status())
  assert.equal(tasks.tasks.length,1)
  await win.evaluate(async id=>window.toolDock.textConversion.start([id]),tasks.tasks[0].id)
  let completed
  for(let attempt=0;attempt<150;attempt++){
   completed=await win.evaluate(()=>window.toolDock.textConversion.status())
   if(['completed','failed'].includes(completed.tasks[0]?.state))break
   await new Promise(resolve=>setTimeout(resolve,160))
  }
  assert.ok(completed,'任务状态未返回')
  console.log('TASK_AFTER',completed.tasks.map(t=>({state:t.state,error:t.error,attempts:t.attempts,percent:t.percent})))
  assert.equal(completed.tasks[0].state,'completed',completed.tasks[0].error)
  const preview=await win.evaluate(id=>window.toolDock.textConversion.preview(id,'result',0,1000),completed.tasks[0].id)
  assert.match(preview.text,/繁体字幕/)
  await win.getByRole('button',{name:'操作 · demo.srt'}).click()
  await win.getByRole('menuitem',{name:'修改输出文件名'}).click()
  const renameDialog=win.getByRole('dialog',{name:'修改输出文件名'})
  await renameDialog.locator('input').fill('custom_subtitle')
  await renameDialog.getByRole('button',{name:'保存'}).click()
  await win.getByText('custom_subtitle.srt',{exact:true}).waitFor({timeout:8000})
  const renamed=await win.evaluate(()=>window.toolDock.textConversion.status())
  assert.equal(renamed.tasks[0].outputName,'custom_subtitle.srt')
  const target=path.join(tmp,'result.srt')
  await fs.writeFile(target,'DO_NOT_OVERWRITE')
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},target)
  const saved=await win.evaluate(id=>window.toolDock.textConversion.saveOne(id),completed.tasks[0].id)
  assert.equal(path.basename(saved),'result (1).srt')
  assert.equal(await fs.readFile(target,'utf8'),'DO_NOT_OVERWRITE')
  assert.match(await fs.readFile(saved,'utf8'),/繁体字幕/)
  const zipPath=path.join(tmp,'converted.zip')
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file})},zipPath)
  const zipped=await win.evaluate(id=>window.toolDock.textConversion.saveZip([id]),completed.tasks[0].id)
  assert.equal(zipped,zipPath)
  const AdmZip=require('adm-zip'),archive=new AdmZip(zipPath)
  assert.equal(archive.getEntries().length,1)
  assert.equal(archive.getEntries()[0].entryName,'custom_subtitle.srt')
  assert.match(archive.readAsText('custom_subtitle.srt'),/繁体字幕/)
  console.log('ELECTRON_UI_AND_QUEUE_PASSED: text Worker, third tab, file queue, menu rename, no-overwrite save and ZIP')
 }finally{
  if(app)await app.close().catch(()=>{})
  await fs.rm(tmp,{recursive:true,force:true}).catch(()=>{})
 }
}
main().catch(e=>{console.error(e);process.exitCode=1})
