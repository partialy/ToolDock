import {createIco} from '../lib/image/ico'
import {fitRect,outputDimensions,type CropRect,type FitMode} from '../lib/image/geometry'
import type {ImageFormat} from '../lib/image/export'
export type Job={
 file:Blob;kind:'image'|'logo';crop?:CropRect;
 mode:'width'|'percent'|'fixed';sizeValue:number;targetHeight:number;
 fit:FitMode;quality:number;format:ImageFormat;
 sizes:number[];formats:string[];stem:string
}
export type JobOutput={name:string;blob:Blob;format:'png'|'jpg'|'webp'|'ico';width:number;height:number}
function convert(bitmap:ImageBitmap,width:number,height:number,format:ImageFormat,quality:number,fit:FitMode,crop?:CropRect){
 const canvas=new OffscreenCanvas(width,height)
 const ctx=canvas.getContext('2d')
 if(!ctx)throw Error('无法创建画布')
 if(format==='jpeg'){ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height)}
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
 const base=crop||{x:0,y:0,width:bitmap.width,height:bitmap.height}
 const r=fitRect(base.width,base.height,width,height,fit)
 ctx.drawImage(bitmap,base.x+r.sx,base.y+r.sy,r.sw,r.sh,r.dx,r.dy,r.dw,r.dh)
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
  const results:JobOutput[]=[]
  if(job.kind==='logo'){
   const frames:{size:number;png:Uint8Array}[]=[]
   for(const size of job.sizes.slice().sort((a,b)=>a-b)){
    if(!Number.isInteger(size)||size<1||size>1024)throw Error('图标尺寸不正确')
    if(job.formats.includes('ico')&&size<=256){
     const blob=await convert(bitmap,size,size,'png',job.quality,'contain',region)
     frames.push({size,png:new Uint8Array(await blob.arrayBuffer())})
    }
    for(const fmt of job.formats.filter(x=>x!=='ico') as ImageFormat[]){
     if(!['png','jpeg','webp'].includes(fmt))throw Error('输出格式无效')
     const blob=await convert(bitmap,size,size,fmt,job.quality,'contain',region)
     const ext=fmt==='jpeg'?'jpg':fmt
     results.push({name:job.stem+'_'+size+'x'+size+'.'+ext,blob,format:ext,width:size,height:size})
    }
   }
   if(job.formats.includes('ico')){
    if(!frames.length)throw Error('ICO 必须选择至少一个 256px 及以下的尺寸')
    const data=createIco(frames)
    results.push({name:job.stem+'.ico',blob:new Blob([new Uint8Array(data)],{type:'image/x-icon'}),format:'ico',width:0,height:0})
   }
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
