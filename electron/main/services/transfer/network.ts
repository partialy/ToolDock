import os from 'node:os'
import {isIP} from 'node:net'
import type {LanInterface} from '../../../../src/shared/fileTransferModels'
export function isPrivateIpv4(ip:string):boolean{
 if(isIP(ip)!==4)return false
 const [a,b]=ip.split('.').map(Number)
 return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)
}
export function interfaces():LanInterface[]{
 const list:LanInterface[]=[]
 for(const [name,records] of Object.entries(os.networkInterfaces()))
  for(const record of records||[]){
   if(record.family!=='IPv4'||record.internal||!isPrivateIpv4(record.address))continue
   list.push({id:record.address,name,address:record.address,netmask:record.netmask})
  }
 return list.sort((a,b)=>Number(/virtual|vmware|wsl|vbox|vpn|hyper-v|vethernet/i.test(a.name))-Number(/virtual|vmware|wsl|vbox|vpn|hyper-v|vethernet/i.test(b.name)))
}
const toInt=(ip:string)=>ip.split('.').reduce((n,v)=>(n*256+Number(v))>>>0,0)
export function sameSubnet(local:string,mask:string,remote:string):boolean{
 if(remote.startsWith('::ffff:'))remote=remote.slice(7)
 if(isIP(remote)!==4)return false
 const m=toInt(mask)
 return (toInt(local)&m)===(toInt(remote)&m)
}
export function safeFilename(raw:string):string{
 const base=(raw.replace(/\\/g,'/').split('/').pop()||'未命名').trimEnd()
 let name=base.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').replace(/[. ]+$/,'').slice(0,180)
 if(!name||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(name))name='文件_'+name
 return name
}
