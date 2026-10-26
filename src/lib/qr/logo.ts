import {MAX_LOGO_BYTES} from './config'
/** Strip metadata and ensure a self-contained transparent or white-backed PNG. */
export async function processQrLogo(file:File,radius=20):Promise<string>{
 if(file.size<1||file.size>MAX_LOGO_BYTES)throw Error('Logo 限制为 2 MiB')
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('仅支持本地 PNG、JPEG、WebP')
 const head=new Uint8Array(await file.slice(0,16).arrayBuffer())
 const png=[137,80,78,71,13,10,26,10].every((v,i)=>head[i]===v)
 const jpg=head[0]===255&&head[1]===216&&head[2]===255
 const webp=String.fromCharCode(...head.subarray(0,4))==='RIFF'&&String.fromCharCode(...head.subarray(8,12))==='WEBP'
 if(!((png&&file.type==='image/png')||(jpg&&file.type==='image/jpeg')||(webp&&file.type==='image/webp')))throw Error('Logo 图片格式与文件内容不一致')
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>8_000_000)throw Error('Logo 像素数超过 800 万')
  const side=256,margin=18,canvas=document.createElement('canvas')
  canvas.width=side;canvas.height=side
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建 Logo 画布')
  const r=Math.max(0,Math.min(50,radius))/100*side
  ctx.beginPath();ctx.roundRect(0,0,side,side,r);ctx.clip()
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,side,side)
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
  const scale=Math.min((side-margin*2)/bitmap.width,(side-margin*2)/bitmap.height)
  const w=bitmap.width*scale,h=bitmap.height*scale
  ctx.drawImage(bitmap,(side-w)/2,(side-h)/2,w,h)
  const uri=canvas.toDataURL('image/png');canvas.width=0;canvas.height=0
  return uri
 }finally{bitmap.close()}
}
