import iconv from 'iconv-lite'
import type {ConversionEncoding,ConversionOutputEncoding} from '../../../../src/shared/textConversionModels'
export interface DecodedText {text:string;encoding:Exclude<ConversionEncoding,'auto'>;bom:boolean}
const names={utf8:'utf8',gb18030:'gb18030',big5:'big5'} as const
function decodeExact(input:Buffer,encoding:Exclude<ConversionEncoding,'auto'>):string {
 if(encoding==='utf8')return new TextDecoder('utf-8',{fatal:true}).decode(input)
 const text=iconv.decode(input,names[encoding])
 if(!iconv.encode(text,names[encoding]).equals(input))throw Error('该编码无法无损解码，请手动选择正确的输入编码')
 return text
}
export function decodeInput(input:Buffer,choice:ConversionEncoding):DecodedText {
 const bom=input.length>=3&&input.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf]))
 if(bom&&choice!=='auto'&&choice!=='utf8')throw Error('文件含 UTF-8 BOM，输入编码选择不正确')
 const raw=bom?input.subarray(3):input
 if(choice!=='auto')return{text:decodeExact(raw,choice),encoding:choice,bom}
 try{return{text:decodeExact(raw,'utf8'),encoding:'utf8',bom}}catch{}
 const possibilities:(Exclude<ConversionEncoding,'auto'>)[]=['gb18030','big5']
 const matched=possibilities.flatMap(encoding=>{
  try{return [{text:decodeExact(raw,encoding),encoding}]}catch{return []}
 })
 if(matched.length===1)return {...matched[0],bom}
 if(!matched.length)throw Error('无法解码文本，请手动指定 GB18030 或 Big5')
 throw Error('无法可靠区分 GB18030 和 Big5，请为该文件选择输入编码')
}
export function encodeOutput(text:string,source:DecodedText,output:ConversionOutputEncoding):Buffer {
 const encoding=output==='utf8'?'utf8':source.encoding
 if(encoding==='utf8'){const raw=Buffer.from(text,'utf8');return output==='preserve'&&source.bom?Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),raw]):raw}
 const bytes=iconv.encode(text,encoding)
 if(iconv.decode(bytes,encoding)!==text)throw Error('目标文字无法以 '+encoding+' 无损保存，请将输出编码改为 UTF-8 后重新转换')
 return bytes
}
