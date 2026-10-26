import jsQR from 'jsqr'
export type ScanResult={ok:true;text:string}|{ok:false;reason:string}
export async function verifyQrBlob(blob:Blob,expected:string):Promise<ScanResult>{
 let bitmap:ImageBitmap
 try{bitmap=await createImageBitmap(blob)}catch{return {ok:false,reason:'无法解码二维码图像'}}
 try{
  const canvas=document.createElement('canvas')
  canvas.width=bitmap.width;canvas.height=bitmap.height
  const ctx=canvas.getContext('2d',{willReadFrequently:true})
  if(!ctx)return {ok:false,reason:'无法获得图像像素'}
  ctx.drawImage(bitmap,0,0)
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height)
  const match=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'dontInvert'})
  canvas.width=0;canvas.height=0
  if(!match)return {ok:false,reason:'本地扫码器未能识别，请尝试更高尺寸、减少 Logo 或使用经典方块'}
  if(match.data!==expected)return {ok:false,reason:'二维码解码内容与输入不一致，禁止直接导出'}
  return {ok:true,text:match.data}
 }finally{bitmap.close()}
}
