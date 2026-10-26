import QRCodeStyling from 'qr-code-styling'
import {toStylingOptions,type QrConfig} from './config'

export type QrExportFormat='png'|'webp'|'svg'
export type QrSnapshot={config:QrConfig;logo?:string;revision:number}
export function qrInstance(snapshot:QrSnapshot):QRCodeStyling{
 return new QRCodeStyling(toStylingOptions(snapshot.config,snapshot.logo))
}
export async function qrBlob(snapshot:QrSnapshot,format:QrExportFormat):Promise<Blob>{
 const qr=qrInstance(snapshot)
 const data=await qr.getRawData(format)
 if(!data)throw Error('二维码图像未能生成')
 const blob=data instanceof Blob?data:new Blob([new Uint8Array(data)])
 if(!blob.size)throw Error('二维码结果为空')
 if(format==='svg'){
  const xml=await blob.text()
  assertSafeGeneratedSvg(xml)
  return new Blob([xml],{type:'image/svg+xml'})
 }
 if(format==='webp'&&blob.type!=='image/webp')throw Error('当前图像编码器无法输出 WebP')
 return blob
}
export function assertSafeGeneratedSvg(svg:string){
 if(!/^\s*<svg\b/i.test(svg)&&!/<svg\b/i.test(svg))throw Error('SVG 结构错误')
 if(/<\s*(script|foreignObject|iframe|object)\b|<!DOCTYPE|<!ENTITY|onload\s*=|onerror\s*=|javascript:|file:|https?:\/\//i.test(svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,'')))throw Error('SVG 包含不安全外部引用或脚本')
 for(const match of svg.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)){
  if(!match[1].startsWith('data:image/png;base64,'))throw Error('SVG 包含非内嵌的图片引用')
 }
}
