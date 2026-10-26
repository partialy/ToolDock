export type TimestampUnit='auto'|'second'|'millisecond'
const MAX_DATE=8640000000000000n
export function timestampToDate(value:string,unit:TimestampUnit='auto'):Date{
 const input=value.trim()
 if(!/^[+-]?\d+$/.test(input))throw Error('请输入整数时间戳')
 let chosen=unit
 if(chosen==='auto'){
  const digits=input.replace(/^[+-]/,'').length
  if(digits===10)chosen='second'
  else if(digits===13)chosen='millisecond'
  else throw Error('无法自动判断单位，请指定秒或毫秒')
 }
 const n=BigInt(input)*(chosen==='second'?1000n:1n)
 if(n>MAX_DATE||n< -MAX_DATE)throw Error('时间戳超出可转换日期范围')
 const date=new Date(Number(n))
 if(Number.isNaN(date.getTime()))throw Error('无效时间戳')
 return date
}
export function dateToTimestamps(date:Date){
 if(!Number.isFinite(date.getTime()))throw Error('无效日期')
 return {millisecond:String(date.getTime()),second:String(Math.floor(date.getTime()/1000))}
}
export function formatLocal(date:Date):string{
 const f=(x:number,len=2)=>String(x).padStart(len,'0')
 return [f(date.getFullYear(),4),f(date.getMonth()+1),f(date.getDate())].join('-')+' '+[f(date.getHours()),f(date.getMinutes()),f(date.getSeconds())].join(':')
}
export function parseLocalDateTime(value:string):Date{
 const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim())
 if(!m)throw Error('请输入 YYYY-MM-DD HH:mm:ss')
 const [y,mo,d,h,mi,s]=m.slice(1).map(Number)
 if(y<100||mo<1||mo>12||d<1||d>31||h>23||mi>59||s>59)throw Error('日期或时间范围无效')
 const result=new Date(0);result.setFullYear(y,mo-1,d);result.setHours(h,mi,s,0)
 if(result.getFullYear()!==y||result.getMonth()!==mo-1||result.getDate()!==d||result.getHours()!==h||result.getMinutes()!==mi||result.getSeconds()!==s)throw Error('本地日期无效（可能位于夏令时切换时段）')
 const later=new Date(result.getTime()+3600000)
 if(later.getFullYear()===y&&later.getMonth()===mo-1&&later.getDate()===d&&later.getHours()===h&&later.getMinutes()===mi&&later.getSeconds()===s)throw Error('夏令时回拨导致此本地时间不唯一，请选择其他时间或明确偏移')
 return result
}
