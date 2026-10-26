import {sanitizeSvg} from './svg-safety'
/** Browser Image element supports SVG while createImageBitmap inside a Worker may not.
 * SVG has been strictly sanitized before it enters the isolated img element. */
export async function rasterizeSafeSvg(file:Blob):Promise<Blob>{
 const raw=await file.text(),safe=sanitizeSvg(raw)
 const url=URL.createObjectURL(new Blob([safe],{type:'image/svg+xml'}))
 try{
  const img=new Image()
  await new Promise<void>((resolve,reject)=>{
   img.onload=()=>resolve()
   img.onerror=()=>reject(Error('SVG 图像解码失败，请检查宽高与 viewBox'))
   img.src=url
  })
  const width=img.naturalWidth,height=img.naturalHeight
  if(!width||!height||width*height>40000000||width>8192||height>8192)throw Error('SVG 原始绘制尺寸超出 8192px/4000 万像素限制')
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const ctx=canvas.getContext('2d')
  if(!ctx)throw Error('Canvas 初始化失败')
  ctx.clearRect(0,0,width,height);ctx.drawImage(img,0,0,width,height)
  const output=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('SVG 栅格化失败')),'image/png'))
  canvas.width=0;canvas.height=0
  return output
 }finally{URL.revokeObjectURL(url)}
}
