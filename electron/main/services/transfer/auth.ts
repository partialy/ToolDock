import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {DeviceInfo} from '../../../../src/shared/fileTransferModels'
import {nextDeviceName} from './device-names'
type Device=DeviceInfo&{token:string}
export type DeviceResolution={status:'ok';device:DeviceInfo}|{status:'anonymous'}|{status:'revoked'}

export class LanAuth{
 readonly pin=String(randomInt(0,1_000_000)).padStart(6,'0')
 private devices=new Map<string,Device>()
 private byToken=new Map<string,string>()
 private revokedTokens=new Set<string>()
 private attempts=new Map<string,{count:number;until:number}>()
 private equals(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}

 /** 校验访问码并在首次访问或原令牌失效时签发轻量设备身份。 */
 authorize(pinValue:string,ip:string,agent:string,existingToken?:string):{device:DeviceInfo;token:string}{
  const record=this.attempts.get(ip)||{count:0,until:0}
  if(record.until>Date.now())throw Error('尝试次数过多，请稍后再试')
  if(!this.equals(pinValue,this.pin)){
   record.count++;if(record.count>=8){record.until=Date.now()+5*60_000;record.count=0}
   this.attempts.set(ip,record);throw Error('访问码无效')
  }
  this.attempts.delete(ip)
  if(existingToken&&!this.revokedTokens.has(existingToken)){
   const existingId=this.byToken.get(existingToken)
   const existing=existingId?this.devices.get(existingId):undefined
   if(existing){
    existing.ip=ip;existing.agent=agent.slice(0,120);existing.lastSeen=Date.now()
    return {device:this.asPublic(existing),token:existing.token}
   }
  }
  const id=randomBytes(16).toString('hex'),token=randomBytes(24).toString('base64url')
  const name=nextDeviceName(new Set([...this.devices.values()].flatMap(d=>d.name?[d.name]:[])))
  const entry:Device={id,token,ip,agent:agent.slice(0,120),name,connectedAt:Date.now(),lastSeen:Date.now()}
  this.devices.set(id,entry);this.byToken.set(token,id)
  return {device:this.asPublic(entry),token}
 }

 /** 仅校验访问码（优先读取请求头 X-ToolDock-Pin，其次读取查询参数 ?pin=）。 */
 verifyPin(req:IncomingMessage,url:URL):boolean{
  const header=req.headers['x-tooldock-pin']
  const candidate=typeof header==='string'&&header?header:(url.searchParams.get('pin')||'')
  return Boolean(candidate)&&this.equals(candidate,this.pin)
 }

 /** 可选识别轻量设备身份：仅用于记录设备在线信息与文件/消息署名，未携带时不阻断访问。 */
 resolveDevice(req:IncomingMessage,ip:string):DeviceResolution{
  const raw=req.headers['x-tooldock-device']
  const token=typeof raw==='string'?raw.trim():''
  if(!token)return {status:'anonymous'}
  if(this.revokedTokens.has(token))return {status:'revoked'}
  const id=this.byToken.get(token)
  const v=id?this.devices.get(id):undefined
  if(!v)return {status:'anonymous'}
  v.ip=ip;v.lastSeen=Date.now()
  return {status:'ok',device:this.asPublic(v)}
 }

 private asPublic(entry:Device):DeviceInfo{const {id,ip,agent,connectedAt,lastSeen,name}=entry;return {id,ip,agent,connectedAt,lastSeen,name}}
 list(){return [...this.devices.values()].map(v=>this.asPublic(v))}
 revoke(id:string){
  const v=this.devices.get(id)
  if(v){this.revokedTokens.add(v.token);this.byToken.delete(v.token)}
  this.devices.delete(id)
 }
 clear(){this.devices.clear();this.byToken.clear();this.revokedTokens.clear();this.attempts.clear()}
}
export function sendJson(res:ServerResponse,code:number,body:unknown){
 res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
 res.end(JSON.stringify(body))
}
export async function receiveJson(req:IncomingMessage,max=2048):Promise<Record<string,unknown>>{
 let size=0;const chunks:Buffer[]=[]
 for await(const raw of req){const b=Buffer.from(raw as Buffer);size+=b.length;if(size>max)throw Error('请求内容过大');chunks.push(b)}
 const data=JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('无效请求内容')
 return data as Record<string,unknown>
}
