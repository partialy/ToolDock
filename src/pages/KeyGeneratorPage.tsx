import { useState } from 'react'
import { Copy, Download, Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { SwitchField } from '@/components/ui/switch-field'
import { Base64Panel } from '@/components/base64/Base64Panel'
import type {CryptoResult} from '@/types/models'
type Kind='ssh'|'rsa'|'aes'|'random'|'base64'
const alphabetSets={upper:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',lower:'abcdefghijklmnopqrstuvwxyz',number:'0123456789',symbol:'!@#$%^&*_-+='}
function download(name:string,contents:string){
 const blob=new Blob([contents],{type:'application/octet-stream'})
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)
}
export function KeyGeneratorPage(){
 const [aesFormat,setAesFormat]=useState<'hex'|'base64'|'base64url'>('hex'),[excludeAmbiguous,setExcludeAmbiguous]=useState(true)
 const [kind,setKind]=useState<Kind>('ssh'),[sshKind,setSshKind]=useState<'ed25519'|'rsa'>('ed25519'),[bits,setBits]=useState(3072),[aesBits,setAesBits]=useState<128|256>(256),[length,setLength]=useState(32),[chars,setChars]=useState({...alphabetSets}),[comment,setComment]=useState('tooldock'),[passphrase,setPassphrase]=useState(''),[result,setResult]=useState<CryptoResult|null>(null),[busy,setBusy]=useState(false),[showSecret,setShowSecret]=useState(false),[error,setError]=useState('')
 const chooseKind=(k:Kind)=>{setKind(k);setResult(null);setShowSecret(false);setError('')}
 const gen=async()=>{setBusy(true);setError('');setResult(null);setShowSecret(false)
  try {
   let res:CryptoResult
   if(kind==='rsa')res=await window.toolDock.crypto.rsa(bits,passphrase||undefined)
   else if(kind==='ssh')res=await window.toolDock.crypto.ssh(sshKind,bits,comment,passphrase||undefined)
   else if(kind==='aes')res=await window.toolDock.crypto.aes(aesBits)
   else res=await window.toolDock.crypto.random(length,Object.values(chars).join('').replace(excludeAmbiguous?/[Il1O0]/g:/a^/g,''))
   setResult(res)
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value)}catch{setError('无法复制到剪贴板')}}
 const displaySecret=(value:string)=>{if(kind!=='aes'||aesFormat==='hex')return value;const raw=value.match(/../g)!.map(s=>String.fromCharCode(parseInt(s,16))).join('');const b64=btoa(raw);return aesFormat==='base64'?b64:b64.split('+').join('-').split('/').join('_').replace(/=+$/,'')}
 const renderOutput=(title:string,value:string,filename:string,sensitive:boolean)=><section className="space-y-2">
  <div className="flex items-center justify-between"><h3 className="text-xs font-medium muted">{title}</h3><div className="flex gap-1">
   {sensitive&&<Button size="icon" variant="ghost" onClick={()=>setShowSecret(!showSecret)} title={showSecret?'隐藏':'显示'}>{showSecret?<EyeOff size={15}/>:<Eye size={15}/>}</Button>}
   <Button variant="ghost" size="icon" onClick={()=>void copy(value)} title="复制"><Copy size={15}/></Button>
   <Button variant="ghost" size="icon" onClick={()=>download(filename,value)} title="下载"><Download size={15}/></Button>
  </div></div>
  <textarea readOnly value={sensitive&&!showSecret?'••••••••••••••••••••••••••••••••':value} aria-label={title} className="h-36 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] p-3 font-mono text-xs outline-none"/>
 </section>
 return <div className="mx-auto max-w-4xl space-y-6 p-8">
  <div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><KeyRound size={24}/></div><div><h1 className="text-2xl font-semibold">密钥生成器</h1><p className="mt-1 text-sm muted">本地生成标准密钥，默认不保存私钥和随机密钥。</p></div></div>
  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
   <div className="mb-5 flex flex-wrap gap-2">{([['ssh','SSH 密钥'],['rsa','RSA 密钥'],['aes','AES 密钥'],['random','随机字符串'],['base64','Base64 编解码']] as const).map(([k,label])=><button key={k} onClick={()=>chooseKind(k)} className={'rounded-lg px-4 py-2 text-xs font-medium transition-colors '+(kind===k?'bg-indigo-500 text-white':'bg-[var(--panel-alt)] hover:bg-[var(--hover)]')}>{label}</button>)}</div>
   {kind==='base64' ? <Base64Panel/> : <><div className="grid gap-4 sm:grid-cols-2">
    {kind==='ssh'&&<div className="space-y-2 text-xs muted"><span className="block">SSH 算法</span><SelectField ariaLabel="SSH 算法" className="w-full" value={sshKind} onValueChange={v=>{setSshKind(v as 'ed25519'|'rsa');setResult(null)}} options={[{value:'ed25519',label:'Ed25519（推荐）',description:'短密钥，适合现代 SSH'},{value:'rsa',label:'RSA',description:'兼容传统 SSH 环境'}]}/></div>}
    {(kind==='rsa'||kind==='ssh'&&sshKind==='rsa')&&<div className="space-y-2 text-xs muted"><span className="block">RSA 长度</span><SelectField ariaLabel="RSA 长度" className="w-full" value={String(bits)} onValueChange={v=>{setBits(Number(v));setResult(null)}} options={[{value:'2048',label:'2048 bit',description:'兼容性优先'},{value:'3072',label:'3072 bit（推荐）',description:'安全与效率平衡'},{value:'4096',label:'4096 bit',description:'更高强度，生成稍慢'}]}/></div>}
    {kind==='aes'&&<div className="space-y-2 text-xs muted"><span className="block">AES 长度</span><SelectField ariaLabel="AES 长度" className="w-full" value={String(aesBits)} onValueChange={v=>{setAesBits(Number(v) as 128|256);setResult(null)}} options={[{value:'128',label:'AES-128',description:'16 字节随机密钥'},{value:'256',label:'AES-256（推荐）',description:'32 字节随机密钥'}]}/></div>}
    {kind==='ssh'&&<label className="space-y-2 text-xs muted">公钥备注<Input value={comment} onChange={e=>setComment(e.target.value)} maxLength={100}/></label>}
    {(kind==='ssh'||kind==='rsa')&&<label className="space-y-2 text-xs muted">加密密码（可选，至少8位）<Input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} placeholder="不填则不加密"/></label>}
    {kind==='aes'&&<div className="space-y-2 text-xs muted"><span className="block">输出编码</span><SelectField ariaLabel="AES 输出编码" className="w-full" value={aesFormat} onValueChange={v=>setAesFormat(v as typeof aesFormat)} options={[{value:'hex',label:'Hex',description:'十六进制字符串'},{value:'base64',label:'Base64',description:'标准 Base64 编码'},{value:'base64url',label:'Base64URL',description:'适合 URL 和 Token'}]}/></div>}
    {kind==='random'&&<><label className="space-y-2 text-xs muted">长度（1-4096）<Input type="number" value={length} min={1} max={4096} onChange={e=>setLength(Number(e.target.value))}/></label>
     <div className="space-y-2 text-xs muted"><div>字符集</div><div className="flex flex-wrap gap-3">{Object.entries(alphabetSets).map(([k,v])=><label key={k} className="flex items-center gap-1"><input type="checkbox" checked={chars[k as keyof typeof chars].length>0} onChange={e=>setChars(x=>({...x,[k]:e.target.checked?v:''}))}/>{({upper:'大写',lower:'小写',number:'数字',symbol:'符号'} as Record<string,string>)[k]}</label>)}</div></div><div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3 py-2"><span className="text-xs muted">排除易混淆字符（I、l、1、O、0）</span><SwitchField ariaLabel="排除易混淆字符" checked={excludeAmbiguous} onCheckedChange={setExcludeAmbiguous}/></div></>}
   </div>
   <div className="mt-6 flex items-center justify-between"><span className="flex items-center gap-2 text-xs muted"><ShieldCheck size={15}/> 密码学安全随机源</span><Button variant="primary" onClick={()=>void gen()} disabled={busy}><RefreshCw size={16} className={busy?'animate-spin':''}/>{busy?'生成中...':'生成密钥'}</Button></div></>}
  </div>
  {result&&<div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5">
   <h2 className="mb-3 font-medium">{kind==='aes'?result.info.replace('Hex',aesFormat):result.info}</h2>
   {result.publicKey&&renderOutput('公钥',result.publicKey,kind==='ssh'?'id_key.pub':'public.pem',false)}
   {result.privateKey&&renderOutput('私钥 · 请妥善保管',result.privateKey,kind==='ssh'?'id_key':'private.pem',true)}
   {result.secret&&renderOutput('密钥 / 随机字符串',displaySecret(result.secret),kind==='aes'?'aes-key.txt':'random.txt',true)}
   <p className="text-xs muted">关闭当前页面会清除本页结果；复制到剪贴板后请注意其他应用可读取剪贴板内容。</p>
  </div>}
  {error&&<p className="text-sm text-red-400" role="alert">{error}</p>}
 </div>
}
