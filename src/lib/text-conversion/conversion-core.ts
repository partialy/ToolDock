import OpenCC from 'opencc-js'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import type {ConversionFormat,ConversionPreferences} from '../../shared/textConversionModels'

type Converter=(text:string)=>string
const converters=new Map<string,Converter>()
export function outputSuffix(settings:ConversionPreferences){
 return settings.suffix|| (settings.direction==='simplify'?'_simplify':'_traditional')
}
export function converterFor(settings:ConversionPreferences):Converter {
 const from=settings.direction==='simplify'?(settings.region==='tw'?(settings.phraseConversion?'twp':'tw'):settings.region==='hk'?(settings.phraseConversion?'hkp':'hk'):'t'):'cn'
 const to=settings.direction==='simplify'?'cn':settings.region==='tw'?(settings.phraseConversion?'twp':'tw'):settings.region==='hk'?(settings.phraseConversion?'hkp':'hk'):'t'
 const key=from+'>'+to
 let converter=converters.get(key)
 if(!converter){converter=OpenCC.Converter({from:from as 'cn',to:to as 'cn'});converters.set(key,converter)}
 return converter
}
function protectedInline(text:string,convert:Converter){
 return text.split(/(<[^>\r\n]*>|&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][\da-zA-Z]+);|\{\\[^}\r\n]*\})/g)
  .map(part=>part.startsWith('<')||part.startsWith('&')||part.startsWith('{\\')?part:convert(part)).join('')
}
function linesKeepEnd(text:string){
 return text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean)||[]
}
function withLines(text:string,cb:(line:string,index:number,lines:string[])=>string){
 const lines=linesKeepEnd(text)
 return lines.map((raw,index)=>{
  const m=raw.match(/(\r\n|\r|\n)$/);const end=m?.[0]||'',line=end?raw.slice(0,-end.length):raw
  return cb(line,index,lines)+end
 }).join('')
}
function markdown(text:string,convert:Converter) {
 const parser=unified().use(remarkParse)
 const tree=parser.parse(text)
 const edits:{start:number;end:number}[]=[]
 const visit=(node:any)=>{
  if(node.type==='text'&&Number.isInteger(node.position?.start?.offset)&&Number.isInteger(node.position?.end?.offset)){
   edits.push({start:node.position.start.offset,end:node.position.end.offset})
  }
  if(Array.isArray(node.children))node.children.forEach(visit)
 }
 visit(tree)
 const frontmatter=text.match(/^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/)
 const protectedEnd=frontmatter?.[0].length||0
 let result=text
 for(const edit of edits.sort((a,b)=>b.start-a.start)){
  if(edit.start<protectedEnd)continue
  const segment=text.slice(edit.start,edit.end)
  const converted=protectedInline(segment,convert)
  result=result.slice(0,edit.start)+converted+result.slice(edit.end)
 }
 return result
}
function srt(text:string,convert:Converter){
 return withLines(text,line=>{
  if(!line.trim()||/^\d+\s*$/.test(line)||/^\s*\d{2,}:\d\d:\d\d[,.:]\d{2,3}\s*-->/.test(line))return line
  if(/^\s*NOTE(?:\s|$)/.test(line)||/^\s*WEBVTT\b/.test(line))return line
  return protectedInline(line,convert)
 })
}
function vtt(text:string,convert:Converter){
 let block:'normal'|'note'|'style'|'region'='normal'
 const raw=linesKeepEnd(text),content=raw.map(x=>x.replace(/(\r\n|\r|\n)$/,''))
 return withLines(text,(line,index)=>{
  const trimmed=line.trim()
  if(!trimmed){block='normal';return line}
  if(/^WEBVTT(?:\s|$)/.test(trimmed)||/^(?:X-TIMESTAMP-MAP|Kind|Language):/.test(trimmed))return line
  if(/^(NOTE|STYLE|REGION)(?:\s|$)/.test(trimmed)){block=trimmed.split(/\s/)[0].toLowerCase() as typeof block;return line}
  if(block!=='normal'||/-->/.test(line))return line
  if((content[index+1]?.trim()||'').includes('-->'))return line
  return protectedInline(line,convert)
 })
}
function lrc(text:string,convert:Converter){
 return withLines(text,line=>{
  if(/^\s*\[(?:ar|ti|al|by|offset|length|re|ve|au|language):/i.test(line))return line
  return line.split(/(\[(?:\d{1,2}:)?\d{1,2}:\d{1,2}(?:\.\d+)?\]|<\d{1,2}:\d{1,2}(?:\.\d+)?>|\[[^\]\r\n]*\])/g)
   .map(part=>part.startsWith('[')||part.startsWith('<')?part:protectedInline(part,convert)).join('')
 })
}
export function convertContent(text:string,format:ConversionFormat,settings:ConversionPreferences):string {
 const convert=converterFor(settings)
 if(format==='md')return markdown(text,convert)
 if(format==='srt')return srt(text,convert)
 if(format==='vtt')return vtt(text,convert)
 if(format==='lrc')return lrc(text,convert)
 return convert(text)
}
