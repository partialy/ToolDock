import {type CropRect,type FitMode} from './geometry'
import {drawFittedImage} from './logo-render'
const MIME={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'} as const
export type ImageFormat=keyof typeof MIME
export async function decode(file:File,allowSvg=false):Promise<ImageBitmap>{
 let blob:Blob=file
 if(file.type==='image/svg+xml'){
  if(!allowSvg)throw Error('不支持 SVG')
  const {rasterizeSafeSvg}=await import('./svg-rasterize')
  blob=await rasterizeSafeSvg(file)
 }else{
  const {verifyMagic}=await import('./file-validation')
  if(!verifyMagic(new Uint8Array(await file.slice(0,16).arrayBuffer()),file.type))throw Error('图片文件头无效')
 }
 const image=await createImageBitmap(blob,{imageOrientation:'from-image'})
 if(!image.width||!image.height||image.width*image.height>40000000){image.close();throw Error('图片超过 4000 万像素限制')}
 return image
}
export async function renderImage(image:ImageBitmap,width:number,height:number,format:ImageFormat,quality:number,fit:FitMode,crop?:CropRect,radiusPercent=0):Promise<Blob>{
 if(width<1||height<1||width>8192||height>8192||width*height>40000000)throw Error('输出尺寸超出限制')
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
 const ctx=canvas.getContext('2d',{alpha:format!=='jpeg'})
 if(!ctx)throw Error('无法初始化图片画布')
 drawFittedImage({
  ctx,
  source:image,
  sourceWidth:image.width,
  sourceHeight:image.height,
  width,
  height,
  fit,
  crop,
  radiusPercent,
  fillBackground:format==='jpeg'?'#fff':undefined
 })
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片编码失败')),MIME[format],Math.max(.01,Math.min(1,quality/100))))
 canvas.width=0;canvas.height=0
 return blob
}
