export const IMAGE_MAX_BYTES=50*1024*1024
export const BATCH_MAX_BYTES=300*1024*1024
export const BATCH_MAX_COUNT=100
export function validateImageFile(file:File,allowSvg=false){
 if(file.size===0||file.size>IMAGE_MAX_BYTES)throw Error('单个文件需要大于 0 且不超过 50 MiB')
 if(!/\.(png|jpe?g|webp|svg)$/i.test(file.name))throw Error('仅支持 PNG、JPEG、WebP'+(allowSvg?'、SVG':''))
 const ext=file.name.split('.').pop()?.toLowerCase()
 if(ext==='svg'){if(!allowSvg||file.type!=='image/svg+xml')throw Error('图片处理暂不支持 SVG');return}
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('文件类型与扩展名不匹配')
 if((ext==='png'&&file.type!=='image/png')||(['jpg','jpeg'].includes(ext||'')&&file.type!=='image/jpeg')||(ext==='webp'&&file.type!=='image/webp'))throw Error('文件扩展名与内容类型不匹配')
}
export function verifyMagic(buffer:Uint8Array,mime:string){
 if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>buffer[i]===v)
 if(mime==='image/jpeg')return buffer[0]===255&&buffer[1]===216&&buffer[2]===255
 if(mime==='image/webp')return String.fromCharCode(...buffer.subarray(0,4))==='RIFF'&&String.fromCharCode(...buffer.subarray(8,12))==='WEBP'
 return mime==='image/svg+xml'
}
export function safeStem(name:string){
 const stem=name.replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/[. ]+$/,'').trim()
 const base=(stem||'image').slice(0,90)
 return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(base)?'_'+base:base
}
