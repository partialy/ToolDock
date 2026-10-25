import { createCipheriv, generateKeyPairSync, randomBytes, randomInt } from 'node:crypto'
const bcryptPBKDF = require('bcrypt-pbkdf') as { pbkdf(password:Buffer,passLength:number,salt:Buffer,saltLength:number,output:Buffer,outputLength:number,rounds:number):number }
import type { CryptoResult } from '../../../src/types/models'
const u32=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b}
const str=(b:Buffer|string)=>{const x=Buffer.isBuffer(b)?b:Buffer.from(b,'utf8');return Buffer.concat([u32(x.length),x])}
const b64url=(b:string)=>Buffer.from(b.replace(/-/g,'+').replace(/_/g,'/'),'base64')
const mpint=(bytes:Buffer)=>{let b=bytes;while(b.length>0 && b[0]===0)b=b.subarray(1);if(b.length&&b[0]>=0x80)b=Buffer.concat([Buffer.from([0]),b]);return str(b)}
function sshPrivate(publicBlob:Buffer,privatePayload:Buffer,passphrase?:string):string {
  const pass=passphrase||''
  const rounds=16
  const salt=randomBytes(16)
  const block=pass?16:8
  const check=randomBytes(4)
  const prefix=Buffer.concat([check,check,privatePayload])
  const padLength=block-(prefix.length%block)
  const plain=Buffer.concat([prefix,Buffer.from(Array.from({length:padLength},(_,i)=>i+1))])
  let cipher='none',kdf='none',options=Buffer.alloc(0),blob=plain
  if(pass) {
    const derived=Buffer.alloc(48)
    const err=bcryptPBKDF.pbkdf(Buffer.from(pass),Buffer.byteLength(pass),salt,salt.length,derived,derived.length,rounds)
    if(err!==0)throw Error('加密私钥失败')
    const iv=derived.subarray(32)
    const encrypt=createCipheriv('aes-256-ctr',derived.subarray(0,32),iv)
    blob=Buffer.concat([encrypt.update(plain),encrypt.final()])
    cipher='aes256-ctr';kdf='bcrypt';options=Buffer.concat([str(salt),u32(rounds)])
  }
  const complete=Buffer.concat([Buffer.from('openssh-key-v1\0'),str(cipher),str(kdf),str(options),u32(1),str(publicBlob),str(blob)])
  const chunks=complete.toString('base64').match(/.{1,70}/g)||[]
  return '-----BEGIN OPENSSH PRIVATE KEY-----\n'+chunks.join('\n')+'\n-----END OPENSSH PRIVATE KEY-----\n'
}
export function generateSsh(kind:'ed25519'|'rsa',bits:number,comment:string,passphrase?:string):CryptoResult {
  if(comment.length>100||/[\r\n]/.test(comment))throw Error('密钥备注过长或含有换行')
  const commentText=comment.trim()
  if(passphrase&&passphrase.length<8)throw Error('私钥加密密码至少8位')
  if(kind==='ed25519') {
    const {publicKey,privateKey}=generateKeyPairSync('ed25519')
    const pub=publicKey.export({format:'der',type:'spki'}) as Buffer
    const priv=privateKey.export({format:'der',type:'pkcs8'}) as Buffer
    const publicRaw=pub.subarray(-32),seed=priv.subarray(-32)
    const pubBlob=Buffer.concat([str('ssh-ed25519'),str(publicRaw)])
    const secret=Buffer.concat([str('ssh-ed25519'),str(publicRaw),str(Buffer.concat([seed,publicRaw])),str(commentText)])
    return {publicKey:'ssh-ed25519 '+pubBlob.toString('base64')+(commentText?' '+commentText:'')+'\n',privateKey:sshPrivate(pubBlob,secret,passphrase),info:'SSH Ed25519 · OpenSSH'}
  }
  if(![2048,3072,4096].includes(bits))throw Error('无效的 RSA 密钥长度')
  const kp=generateKeyPairSync('rsa',{modulusLength:bits,publicExponent:0x10001})
  const jwk=kp.privateKey.export({format:'jwk'}) as JsonWebKey
  const n=b64url(jwk.n!),e=b64url(jwk.e!),privateN=b64url(jwk.d!),p=b64url(jwk.p!),q=b64url(jwk.q!),iqmp=b64url(jwk.qi!)
  const pubBlob=Buffer.concat([str('ssh-rsa'),mpint(e),mpint(n)])
  const secret=Buffer.concat([str('ssh-rsa'),mpint(n),mpint(e),mpint(privateN),mpint(iqmp),mpint(p),mpint(q),str(commentText)])
  return {publicKey:'ssh-rsa '+pubBlob.toString('base64')+(commentText?' '+commentText:'')+'\n',privateKey:sshPrivate(pubBlob,secret,passphrase),info:'SSH RSA-'+bits+' · OpenSSH'}
}
export function generateRsa(bits:number,passphrase?:string):CryptoResult {
 if(![2048,3072,4096].includes(bits))throw Error('无效的 RSA 密钥长度')
 if(passphrase&&passphrase.length<8)throw Error('私钥加密密码至少8位')
 const keys=generateKeyPairSync('rsa',{modulusLength:bits,publicExponent:65537,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:passphrase?{type:'pkcs8',format:'pem',cipher:'aes-256-cbc',passphrase}:{type:'pkcs8',format:'pem'}})
 return {publicKey:keys.publicKey,privateKey:keys.privateKey,info:'RSA-'+bits+' · PKCS#8 / SPKI PEM'}
}
export function generateAes(bits:128|256):CryptoResult {
 if(bits!==128&&bits!==256)throw Error('AES 仅支持 128 或 256 位')
 const k=randomBytes(bits/8)
 return {secret:k.toString('hex'),info:'AES-'+bits+' 密钥 · Hex（'+(bits/8)+' 字节）'}
}
export function generateRandom(length:number,alphabet:string):CryptoResult {
 if(!Number.isInteger(length)||length<1||length>4096)throw Error('随机字符长度需要在1-4096之间')
 const chars=[...new Set([...alphabet])]
 if(chars.length<2||chars.length>256)throw Error('字符集需包含2-256个不同字符')
 let out='';for(let i=0;i<length;i++)out+=chars[randomInt(chars.length)]
 return {secret:out,info:'安全随机字符串 · '+length+' 字符'}
}
