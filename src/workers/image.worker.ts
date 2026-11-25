import {outputDimensions,type CropRect,type FitMode} from '../lib/image/geometry'
import {drawFittedImage,generateLogoOutputs} from '../lib/image/logo-render'
import type {ImageFormat} from '../lib/image/export'
export type Job={
 file:Blob;kind:'image'|'logo';crop?:CropRect;
 mode:'width'|'percent'|'fixed';sizeValue:number;targetHeight:number;
 fit:FitMode;logoFit?:FitMode;cornerRadiusPercent?:number;dualRoundOutput?:boolean;
 quality:number;format:ImageFormat;
 sizes:number[];formats:string[];stem:string
}
export type JobOutput={
 name:string;blob:Blob;format:'png'|'jpg'|'webp'|'ico';
 width:number;height:number;variant?:'default'|'round';radiusPercent?:number
}
function convert(bitmap:ImageBitmap,width:number,height:number,format:ImageFormat,quality:number,fit:FitMode,crop?:CropRect,radiusPercent=0){
 const canvas=new OffscreenCanvas(width,height)
 const ctx=canvas.getContext('2d')
 if(!ctx)throw Error('无法创建画布')
 drawFittedImage({
  ctx,
  source:bitmap,
  sourceWidth:bitmap.width,
  sourceHeight:bitmap.height,
  width,
  height,
  fit,
  crop,
  radiusPercent,
  fillBackground:format==='jpeg'?'#fff':undefined
 })
 return canvas.convertToBlob({type:format==='jpeg'?'image/jpeg':'image/'+format,quality:quality/100})
}
self.onmessage=async (event:MessageEvent<Job>)=>{
 const job=event.data
 let bitmap:ImageBitmap|undefined
 try{
  bitmap=await createImageBitmap(job.file,{imageOrientation:'from-image'})
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('图片超过 4000 万像素')
  const region=job.crop||{x:0,y:0,width:bitmap.width,height:bitmap.height}
  if(region.x<0||region.y<0||region.width<=0||region.height<=0||region.x+region.width>bitmap.width+1||region.y+region.height>bitmap.height+1)throw Error('裁剪区域无效')
  let results:JobOutput[]=[]
  if(job.kind==='logo'){
   const logoFit=job.logoFit??'cover'
   results=await generateLogoOutputs({
    stem:job.stem,
    sizes:job.sizes,
    formats:job.formats,
    cornerRadiusPercent:job.cornerRadiusPercent,
    dualRoundOutput:job.dualRoundOutput,
    renderBlob:(size,fmt,radius)=>convert(bitmap!,size,size,fmt,job.quality,logoFit,region,radius)
   })
  }else{
   const {width,height}=outputDimensions(region.width,region.height,job.mode,job.sizeValue,job.targetHeight)
   const blob=await convert(bitmap,width,height,job.format,job.quality,job.fit,region)
   const ext=job.format==='jpeg'?'jpg':job.format
   results.push({name:job.stem+'_'+width+'x'+height+'.'+ext,blob,format:ext,width,height})
  }
  self.postMessage({ok:true,results})
 }catch(e){self.postMessage({ok:false,error:e instanceof Error?e.message:String(e)})}
 finally{bitmap?.close()}
}
