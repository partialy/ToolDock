/* Fixed, hash-verified GitHub assets only. No system FFmpeg is copied. */
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{createReadStream}=require('node:fs'),{Readable}=require('node:stream'),{pipeline}=require('node:stream/promises'),{spawnSync}=require('node:child_process'),Zip=require('adm-zip')
const root=path.resolve(__dirname,'..'),lock=require('../resources/media/binaries.lock.json')
async function hash(file){const h=crypto.createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex')}
async function main(){
 const cache=path.join(root,'resources/media/cache');await fs.mkdir(cache,{recursive:true})
 for(const id of ['ffmpeg','whisper']){
  const entry=lock[id],archive=path.join(cache,id+'.zip')
  if(await hash(archive).catch(()=> '')!==entry.sha256){
   console.log('Downloading '+id+' '+entry.version);const res=await fetch(entry.url);if(!res.ok||!res.body)throw Error('Download failed: '+res.status)
   await pipeline(Readable.fromWeb(res.body),require('node:fs').createWriteStream(archive));if(await hash(archive)!==entry.sha256)throw Error('SHA-256 mismatch: '+id)
  }
  const target=path.join(root,'resources/media/bin',id);await fs.mkdir(target,{recursive:true});const zip=new Zip(archive)
  for(const e of zip.getEntries()){
   if(e.isDirectory)continue;const name=path.posix.basename(e.entryName)
   if(id==='ffmpeg'?!/^(ffmpeg|ffprobe)\.exe$/i.test(name)&&!/license|copying/i.test(name):!(/\.(dll|exe)$/i.test(name)||/license|copying/i.test(name)))continue
   if(id==='whisper'&&/\.exe$/i.test(name)&&name!=='whisper-cli.exe')continue
   await fs.writeFile(path.join(target,name),e.getData())
  }
  await fs.writeFile(path.join(target,'SOURCE.json'),JSON.stringify({...entry,source:id==='ffmpeg'?'https://github.com/BtbN/FFmpeg-Builds':'https://github.com/ggml-org/whisper.cpp/tree/v1.8.3'},null,2))
  for(const name of ['THIRD-PARTY-NOTICES.md','whisper-LICENSE.txt','SDL2-LICENSE.txt'])await fs.copyFile(path.join(root,'resources/media',name),path.join(target,name))
  for(const source of entry.sources||[]){
   const local=path.join(cache,source.name)
   if(await hash(local).catch(()=> '')!==source.sha256){const response=await fetch(source.url);if(!response.ok||!response.body)throw Error('Source download failed');await pipeline(Readable.fromWeb(response.body),require('node:fs').createWriteStream(local));if(await hash(local)!==source.sha256)throw Error('Source SHA-256 mismatch')}
   await fs.copyFile(local,path.join(target,source.name))
  }
 }
 const ff=path.join(root,'resources/media/bin/ffmpeg/ffmpeg.exe'),version=spawnSync(ff,['-version'],{encoding:'utf8',windowsHide:true});if(version.status!==0||/--enable-gpl|--enable-nonfree/.test(version.stdout))throw Error('FFmpeg LGPL verification failed')
 const enc=spawnSync(ff,['-encoders'],{encoding:'utf8',windowsHide:true});for(const codec of ['libmp3lame','pcm_s16le','flac','aac'])if(!enc.stdout.includes(codec))throw Error('Missing encoder '+codec)
 const whisper=spawnSync(path.join(root,'resources/media/bin/whisper/whisper-cli.exe'),['--help'],{encoding:'utf8',windowsHide:true});if(!((whisper.stdout||'')+(whisper.stderr||'')).includes('--output-srt'))throw Error('Whisper CLI validation failed')
 console.log('Media binaries verified')
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
