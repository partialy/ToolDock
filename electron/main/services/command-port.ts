import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {app} from 'electron'
import {killSchema,portSchema,type KillInput,type PortEntry,type PortQueryResult,type TerminateResult} from '../../../src/shared/commandModels'

const execFileAsync=promisify(execFile)
const protectedNames=new Set(['idle','system','registry','smss','csrss','wininit','winlogon','services','lsass','svchost','dwm','fontdrvhost','sihost','explorer','securityhealthservice','memory compression','tooldock','tooldock-dev'])
function ensureWindows(){if(process.platform!=='win32')throw Error('端口管理仅支持 Windows 10/11')}
function forbidden(pid:number,name:string|null){
 if(pid<=4)return '系统保留进程，不允许结束'
 if(app.getAppMetrics().some(x=>x.pid===pid)||pid===process.pid)return 'ToolDock 自身进程不可结束'
 if(!name)return '无法验证进程名称，不允许结束'
 if(protectedNames.has(name.replace(/\.exe$/i,'').toLowerCase()))return '该进程属于系统或桌面关键进程'
 return null
}
async function powerShell(script:string){
 ensureWindows()
 try{
  const {stdout}=await execFileAsync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{
   windowsHide:true,timeout:15000,maxBuffer:1024*1024,encoding:'utf8'
  })
  const value=stdout.trim()
  if(!value)throw Error('系统没有返回结果')
  return {data:JSON.parse(value) as unknown,raw:value}
 }catch(e){
  const err=e as Error & {killed?:boolean;code?:string|number;stderr?:string}
  if(err.killed)throw Error('系统查询超时（15 秒），请稍后重试')
  if(e instanceof SyntaxError)throw Error('系统命令返回的数据无法解析')
  const detail=(err.stderr||err.message||'').trim()
  throw Error('Windows 操作失败：'+detail.slice(0,600))
 }
}
const header="$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);"
export function normalizePortRows(raw:unknown,port:number):PortEntry[]{
 if(!Array.isArray(raw))throw Error('Windows 返回的端口数据格式错误')
 if(raw.length>4000)throw Error('端口连接数量过多，已停止展示')
 return raw.map(item=>{
  if(!item||typeof item!=='object')throw Error('端口数据格式错误')
  const x=item as Record<string,unknown>,pid=Number(x.pid),localPort=Number(x.localPort)
  if(!Number.isSafeInteger(pid)||pid<0||localPort!==port||!['TCP','UDP'].includes(String(x.protocol)))throw Error('端口数据不符合预期')
  const name=typeof x.name==='string'&&x.name.trim()?x.name:null
  const startedAt=typeof x.startedAt==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(x.startedAt)?x.startedAt:null
  const reason=!startedAt?'无法验证进程启动时间，不允许结束':forbidden(pid,name)
  return {
   protocol:x.protocol as 'TCP'|'UDP',
   family:String(x.localAddress).includes(':')?'IPv6':'IPv4',
   localAddress:String(x.localAddress||''),localPort,
   remoteAddress:x.remoteAddress?String(x.remoteAddress):null,
   remotePort:Number.isInteger(Number(x.remotePort))&&Number(x.remotePort)>0?Number(x.remotePort):null,
   state:x.protocol==='UDP'?'UDP 端点':String(x.state||'未知'),
   pid,name,startedAt,executablePath:x.executablePath?String(x.executablePath):null,
   canTerminate:reason===null,blockReason:reason
  }
 })
}
export async function queryPort(value:number):Promise<PortQueryResult>{
 const port=portSchema.parse(value)
 const start=Date.now()
 const script=header+`
$port=${port}
$rows=[System.Collections.Generic.List[object]]::new()
$tcp=@(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)
$udp=@(Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue)
$details=@{}
foreach($entry in @($tcp)+@($udp)){
 $id=[int]$entry.OwningProcess
 if(-not $details.ContainsKey($id)){
  $name=$null; $startedAt=$null; $exe=$null
  try {
   $p=Get-Process -Id $id -ErrorAction Stop
   $name=$p.ProcessName
   try{$startedAt=$p.StartTime.ToUniversalTime().ToString('o')}catch{}
   try{$exe=$p.Path}catch{}
  }catch{}
  $details[$id]=@{name=$name;startedAt=$startedAt;executablePath=$exe}
 }
}
foreach($entry in $tcp){
 $d=$details[[int]$entry.OwningProcess]
 $rows.Add([pscustomobject]@{protocol='TCP';localAddress=[string]$entry.LocalAddress;localPort=[int]$entry.LocalPort;remoteAddress=[string]$entry.RemoteAddress;remotePort=[int]$entry.RemotePort;state=[string]$entry.State;pid=[int]$entry.OwningProcess;name=$d.name;startedAt=$d.startedAt;executablePath=$d.executablePath})
}
foreach($entry in $udp){
 $d=$details[[int]$entry.OwningProcess]
 $rows.Add([pscustomobject]@{protocol='UDP';localAddress=[string]$entry.LocalAddress;localPort=[int]$entry.LocalPort;remoteAddress=$null;remotePort=$null;state='';pid=[int]$entry.OwningProcess;name=$d.name;startedAt=$d.startedAt;executablePath=$d.executablePath})
}
ConvertTo-Json -InputObject @($rows.ToArray()) -Depth 4 -Compress
`
 const answer=await powerShell(script)
 const rows=normalizePortRows(answer.data,port)
 rows.sort((a,b)=>a.pid-b.pid||a.protocol.localeCompare(b.protocol)||a.state.localeCompare(b.state))
 return {port,rows,durationMs:Date.now()-start,technical:answer.raw}
}
export async function terminatePortProcess(value:KillInput):Promise<TerminateResult>{
 const {port,pid,startedAt,name}=killSchema.parse(value)
 const reason=forbidden(pid,name)
 if(reason)throw Error(reason)
 const start=Date.now()
 const encoded=Buffer.from(name,'utf8').toString('base64')
 const script=header+`
$port=${port}; $pidToEnd=${pid}
$wanted=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
$p=Get-Process -Id $pidToEnd -ErrorAction Stop
if($p.ProcessName -ine $wanted){throw '进程名称已变化，操作取消'}
if($p.StartTime.ToUniversalTime().ToString('o') -cne '${startedAt}'){throw '进程启动时间已变化，操作取消'}
$found=$false
foreach($conn in @(Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)){if($conn.OwningProcess -eq $pidToEnd){$found=$true;break}}
if(-not $found){foreach($conn in @(Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue)){if($conn.OwningProcess -eq $pidToEnd){$found=$true;break}}}
if(-not $found){throw '该进程已不再占用所选端口，请重新查询'}
$p.Kill()
$p.WaitForExit(3000)|Out-Null
ConvertTo-Json -InputObject ([pscustomobject]@{pid=$pidToEnd;name=$wanted}) -Compress
`
 await powerShell(script)
 return {pid,name,durationMs:Date.now()-start}
}
