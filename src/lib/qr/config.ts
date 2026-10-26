import type {DotType,CornerSquareType,CornerDotType,Options,ErrorCorrectionLevel} from 'qr-code-styling'

export const QR_SIZES=[256,384,512,768,1024] as const
export const QR_DOT_STYLES=[
 {id:'square',label:'标准方块'},{id:'rounded',label:'圆角'},{id:'dots',label:'圆点'},
 {id:'classy',label:'流线'},{id:'classy-rounded',label:'柔和流线'},{id:'extra-rounded',label:'超圆角'}
] as const satisfies readonly {id:DotType;label:string}[]
export const QR_EYE_STYLES=[{id:'square',label:'经典'},{id:'extra-rounded',label:'圆角'},{id:'dot',label:'圆点'}] as const satisfies readonly {id:CornerSquareType;label:string}[]
export const QR_THEMES=[
 {id:'classic',name:'经典黑白',dark:'#111827',background:'#ffffff',accent:'#111827'},
 {id:'ocean',name:'海洋蓝',dark:'#123e73',background:'#f3f9ff',accent:'#1766bd'},
 {id:'forest',name:'森系绿',dark:'#174c3a',background:'#f1faf3',accent:'#247451'},
 {id:'violet',name:'暮光紫',dark:'#493289',background:'#faf7ff',accent:'#7258b2'},
 {id:'sunset',name:'落日橙',dark:'#8a351e',background:'#fff7ee',accent:'#ad4b27'},
 {id:'slate',name:'深蓝灰',dark:'#293748',background:'#f8fafc',accent:'#344a60'}
] as const
export type QrThemeId=(typeof QR_THEMES)[number]['id']|'custom'
export interface QrConfig {
 kind:'text'|'url';text:string;url:string;size:number
 dotStyle:DotType;eyeStyle:CornerSquareType;dark:string;background:string;accent:string;theme:QrThemeId
 withLogo:boolean;logoSize:number;logoRadius:number
 ecc:ErrorCorrectionLevel;eccAuto:boolean
}
export const defaultQrConfig:QrConfig={
 kind:'url',text:'',url:'https://www.example.com',size:512,dotStyle:'rounded',eyeStyle:'extra-rounded',
 dark:'#111827',background:'#ffffff',accent:'#111827',theme:'classic',
 withLogo:false,logoSize:0.16,logoRadius:20,ecc:'Q',eccAuto:true
}
export const MAX_QR_BYTES=900
export const MAX_LOGO_BYTES=2*1024*1024
const HEX=/^#[\da-f]{6}$/i
export function normalizeHex(color:string):string{
 const c=color.trim().toLowerCase()
 if(!HEX.test(c))throw Error('颜色必须是 #RRGGBB 的六位十六进制格式')
 return c
}
export function relativeLuminance(hex:string):number{
 const c=normalizeHex(hex)
 const values=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4))
 return .2126*values[0]+.7152*values[1]+.0722*values[2]
}
export function contrastRatio(foreground:string,background:string):number{
 const a=relativeLuminance(foreground),b=relativeLuminance(background)
 return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)
}
export function qrPayload(cfg:Pick<QrConfig,'kind'|'text'|'url'>):string{
 const raw=cfg.kind==='text'?cfg.text:cfg.url.trim()
 if(!raw.trim())throw Error(cfg.kind==='text'?'请输入需要编码的文本':'请输入需要生成二维码的链接')
 if(cfg.kind==='url'){
  let u:URL
  try{u=new URL(raw)}catch{throw Error('请输入完整 http(s) 网址')}
  if(!['http:','https:'].includes(u.protocol)||!u.hostname||u.username||u.password)throw Error('仅支持不包含登录凭据的 HTTP/HTTPS 链接')
 }
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw))throw Error('二维码内容中包含不支持的控制字符')
 const n=new TextEncoder().encode(raw).length
 if(n>MAX_QR_BYTES)throw Error('二维码内容最多 '+MAX_QR_BYTES+' UTF-8 字节，当前 '+n+' 字节')
 return raw
}
export function effectiveEcc(cfg:QrConfig):ErrorCorrectionLevel{return cfg.eccAuto?(cfg.withLogo?'H':'Q'):cfg.ecc}
export function validateQrConfig(cfg:QrConfig):{data:string;contrast:number;accentContrast:number}{
 const data=qrPayload(cfg)
 if(!Number.isInteger(cfg.size)||cfg.size<128||cfg.size>2048)throw Error('二维码尺寸必须是 128–2048 之间的整数')
 if(!QR_DOT_STYLES.some(s=>s.id===cfg.dotStyle)||!QR_EYE_STYLES.some(s=>s.id===cfg.eyeStyle))throw Error('不支持的模块或定位角样式')
 if(!Number.isFinite(cfg.logoSize)||cfg.logoSize<.1||cfg.logoSize>.2)throw Error('Logo 占比限 10%–20%')
 if(!Number.isFinite(cfg.logoRadius)||cfg.logoRadius<0||cfg.logoRadius>50)throw Error('Logo 圆角限 0%–50%')
 if(!['L','M','Q','H'].includes(effectiveEcc(cfg)))throw Error('无效纠错等级')
 const bg=normalizeHex(cfg.background),fg=normalizeHex(cfg.dark),eye=normalizeHex(cfg.accent)
 const contrast=contrastRatio(fg,bg),accentContrast=contrastRatio(eye,bg)
 if(contrast<4.5||accentContrast<4.5)throw Error('点阵及定位角与背景色对比度都必须至少 4.5:1')
 if(relativeLuminance(fg)>=relativeLuminance(bg)||relativeLuminance(eye)>=relativeLuminance(bg))throw Error('前景色和定位角必须比背景色更深')
 return {data,contrast,accentContrast}
}
export function toStylingOptions(cfg:QrConfig,logo?:string):Options{
 const {data}=validateQrConfig(cfg)
 return {type:'canvas',width:cfg.size,height:cfg.size,margin:Math.max(8,Math.round(cfg.size*.085)),data,
  qrOptions:{typeNumber:0,mode:'Byte',errorCorrectionLevel:effectiveEcc(cfg)},
  dotsOptions:{type:cfg.dotStyle,color:normalizeHex(cfg.dark)},
  cornersSquareOptions:{type:cfg.eyeStyle,color:normalizeHex(cfg.accent)},
  cornersDotOptions:{type:cfg.eyeStyle==='dot'?'dot':'square' as CornerDotType,color:normalizeHex(cfg.accent)},
  backgroundOptions:{color:normalizeHex(cfg.background)},
  ...(cfg.withLogo&&logo?{image:logo,imageOptions:{crossOrigin:'anonymous',imageSize:cfg.logoSize,hideBackgroundDots:true,margin:4,saveAsBlob:true}}:{})
 }
}
