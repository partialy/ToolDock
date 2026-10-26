import {randomBytes,randomInt,timingSafeEqual} from 'node:crypto'
import type {IncomingMessage,ServerResponse} from 'node:http'
import type {DeviceInfo} from '../../../../src/shared/fileTransferModels'
type Device=DeviceInfo&{token:string;expires:number}
export class LanAuth{
 readonly pin=String(randomInt(0,1_000_000)).padStart(6,'0')
 readonly bootstrap=randomBytes(24).toString('base64url')
 private devices=new Map<string,Device>()
 private attempts=new Map<string,{count:number;until:number}>()
 private equals(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)}
 authorize(kind:'pin'|'token',value:string,ip:string,agent:string):DeviceInfo{
  const record=this.attempts.get(ip)||{count:0,until:0}
  if(record.until>Date.now())throw Error('尝试次数过多，请稍后再试')
  const correct=kind==='pin'?this.equals(value,this.pin):this.equals(value,this.bootstrap)
  if(!correct){
   record.count++;if(record.count>=8){record.until=Date.now()+5*60_000;record.count=0}
   this.attempts.set(ip,record);throw Error('访问码无效')
  }
  this.attempts.delete(ip)
  const id=randomBytes(16).toString('hex'),token=randomBytes(32).toString('base64url')
  const entry:Device={id,token,ip,agent:agent.slice(0,120),connectedAt:Date.now(),lastSeen:Date.now(),expires:Date.now()+12*60*60_000}
  this.devices.set(id,entry)
  return this.asPublic(entry)
 }
 cookieFor(id:string){const v=this.devices.get(id);if(!v)throw Error('无效设备');return 'tooldock_session='+v.id+'.'+v.token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'}
 private asPublic(entry:Device):DeviceInfo{const {id,ip,agent,connectedAt,lastSeen}=entry;return {id,ip,agent,connectedAt,lastSeen}}
 identify(req:IncomingMessage):DeviceInfo|null{
  const cookie=/(?:^|;\s*)tooldock_session=([a-f0-9]{32})\.([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'')
  if(!cookie)return null
  const v=this.devices.get(cookie[1])
  if(!v||v.expires<Date.now()||!this.equals(v.token,cookie[2]))return null
  const ip=req.socket.remoteAddress?.replace(/^::ffff:/,'')||''
  if(v.ip!==ip)return null
  v.lastSeen=Date.now();return this.asPublic(v)
 }
 list(){return [...this.devices.values()].map(v=>this.asPublic(v))}
 revoke(id:string){this.devices.delete(id)}
 clear(){this.devices.clear();this.attempts.clear()}
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
