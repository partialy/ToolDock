/** ICO image container made of PNG-compressed frames (Windows Vista+). */
export function createIco(frames:{size:number;png:Uint8Array}[]):Uint8Array{
 if(!frames.length)throw Error('至少需要一帧 PNG')
 if(frames.length>32)throw Error('ICO 图层数量过多')
 for(const frame of frames){
  if(!Number.isInteger(frame.size)||frame.size<1||frame.size>256)throw Error('ICO 尺寸必须在 1–256 像素')
  if(frame.png.length<24||frame.png.subarray(0,8).some((v,i)=>v!==[137,80,78,71,13,10,26,10][i]))throw Error('ICO 帧必须为 PNG')
  const view=new DataView(frame.png.buffer,frame.png.byteOffset,frame.png.byteLength)
  if(view.getUint32(16,false)!==frame.size||view.getUint32(20,false)!==frame.size)throw Error('ICO 帧尺寸与 PNG 数据不一致')
 }
 const header=6+16*frames.length,total=header+frames.reduce((n,f)=>n+f.png.length,0)
 const data=new Uint8Array(total),v=new DataView(data.buffer)
 v.setUint16(0,0,true);v.setUint16(2,1,true);v.setUint16(4,frames.length,true)
 let offset=header
 frames.forEach((f,i)=>{
  const p=6+i*16
  data[p]=f.size===256?0:f.size;data[p+1]=data[p];data[p+2]=0;data[p+3]=0
  v.setUint16(p+4,1,true);v.setUint16(p+6,32,true)
  v.setUint32(p+8,f.png.length,true);v.setUint32(p+12,offset,true)
  data.set(f.png,offset);offset+=f.png.length
 })
 return data
}
