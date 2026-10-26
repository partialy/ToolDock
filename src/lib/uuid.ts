export function generateUuids(count:number,uppercase=false,noHyphens=false, generator?:()=>string):string[]{
 if(!Number.isInteger(count)||count<1||count>1000)throw Error('生成数量必须在 1–1000 之间')
 const generate=generator??(()=>{if(!globalThis.crypto?.randomUUID)throw Error('当前环境不支持安全 UUID 生成');return globalThis.crypto.randomUUID()})
 return Array.from({length:count},()=>{
  let v=generate()
  if(noHyphens)v=v.replace(/-/g,'')
  return uppercase?v.toUpperCase():v
 })
}
