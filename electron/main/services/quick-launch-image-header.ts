type Dimensions={width:number;height:number}
const fail=()=>{throw Error('图标文件头无效或图片尺寸超出 8192px / 32 Mi 像素限制')}
function checked(width:number,height:number):Dimensions{
 if(!width||!height||width>8192||height>8192||width*height>32*1024*1024)fail()
 return {width,height}
}

/** 在原生解码之前检查压缩图片的尺寸声明，避免巨像素图先分配内存。 */
export function validateQuickLaunchImageHeader(bytes:Buffer,extension:string):Dimensions{
 if(extension==='.png'){
  if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')return fail()
  return checked(bytes.readUInt32BE(16),bytes.readUInt32BE(20))
 }
 if(extension==='.jpg'||extension==='.jpeg'){
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)return fail()
  let offset=2
  while(offset<bytes.length){
   if(bytes[offset++]!==255)return fail()
   while(offset<bytes.length&&bytes[offset]===255)offset++
   if(offset>=bytes.length)return fail()
   const marker=bytes[offset++]
   if(marker===0xda||marker===0xd9)return fail()
   if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue
   if(offset+2>bytes.length)return fail()
   const size=bytes.readUInt16BE(offset)
   if(size<2||offset+size>bytes.length)return fail()
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    if(size<8)return fail()
    return checked(bytes.readUInt16BE(offset+5),bytes.readUInt16BE(offset+3))
   }
   offset+=size
  }
  return fail()
 }
 if(extension==='.webp'){
  if(bytes.length<20||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)+8!==bytes.length)return fail()
  let dimensions:Dimensions|undefined,frameFound=false
  const scan=(start:number,end:number,nested=false)=>{
   let offset=start
   while(offset<end){
    if(offset+8>end)fail()
    const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),data=offset+8,next=data+size+(size&1)
    if(next>end)fail()
    if(type==='VP8X'){
     if(nested||size!==10)fail()
     dimensions=checked(bytes.readUIntLE(data+4,3)+1,bytes.readUIntLE(data+7,3)+1)
    }else if(type==='VP8 '){
     if(size<10||(bytes[data]&1)!==0||bytes.toString('hex',data+3,data+6)!=='9d012a')fail()
     const image=checked(bytes.readUInt16LE(data+6)&0x3fff,bytes.readUInt16LE(data+8)&0x3fff)
     dimensions??=image;frameFound=true
    }else if(type==='VP8L'){
     if(size<5||bytes[data]!==0x2f)fail()
     const bits=bytes.readUInt32LE(data+1),image=checked((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1)
     dimensions??=image;frameFound=true
    }else if(type==='ANMF'){
     if(nested||size<16)fail()
     checked(bytes.readUIntLE(data+6,3)+1,bytes.readUIntLE(data+9,3)+1)
     scan(data+16,data+size,true)
    }
    offset=next
   }
  }
  scan(12,bytes.length)
  if(!dimensions||!frameFound)return fail()
  return dimensions
 }
 return fail()
}
