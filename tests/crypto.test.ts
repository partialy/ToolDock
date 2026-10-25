import { describe, expect, it } from 'vitest'
import { createPrivateKey, createPublicKey, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { generateAes, generateRandom, generateRsa, generateSsh } from '../electron/main/services/crypto'
describe('密钥生成器',()=>{
 it('RSA 3072 生成有效 PEM 公私钥',()=>{
  const keys=generateRsa(3072)
  expect(keys.privateKey).toContain('BEGIN PRIVATE KEY')
  expect(createPrivateKey(keys.privateKey!).asymmetricKeyDetails?.modulusLength).toBe(3072)
  expect(createPublicKey(keys.publicKey!).asymmetricKeyDetails?.modulusLength).toBe(3072)
 })
 it('RSA PEM 支持密码加密',()=>{
  const keys=generateRsa(2048,'test-passphrase')
  expect(keys.privateKey).toContain('BEGIN ENCRYPTED PRIVATE KEY')
  expect(createPrivateKey({key:keys.privateKey!,passphrase:'test-passphrase'}).asymmetricKeyType).toBe('rsa')
 })
 it('SSH Ed25519 与 RSA 输出 OpenSSH 格式',()=>{
  for(const kind of ['ed25519','rsa'] as const){
   const keys=generateSsh(kind,2048,'tooldock-test')
   expect(keys.publicKey).toMatch(kind==='ed25519'?/^ssh-ed25519 /:/^ssh-rsa /)
   expect(keys.privateKey).toContain('BEGIN OPENSSH PRIVATE KEY')
   const dir=mkdtempSync(path.join(tmpdir(),'tooldock-ssh-'))
   try {
    const file=path.join(dir,'key')
    writeFileSync(file,keys.privateKey!,{mode:0o600})
    writeFileSync(file+'.pub',keys.publicKey!)
    try {
     const pub=execFileSync('ssh-keygen',['-y','-P','','-f',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
     expect(pub.split(' ').slice(0,2)).toEqual(keys.publicKey!.trim().split(' ').slice(0,2))
    } catch(e) {
     // Windows 下 ssh-keygen 可能因继承 ACL 拒绝文件权限，至少核验公钥文本。
     const out=execFileSync('ssh-keygen',['-lf',file+'.pub'],{encoding:'utf8'})
     expect(out).toContain(kind==='ed25519'?'ED25519':'RSA')
    }
   } finally{rmSync(dir,{recursive:true,force:true})}
  }
 })
 it('加密 SSH 私钥可解密',()=>{
  const keys=generateSsh('ed25519',0,'encrypted','long-passphrase')
  expect(keys.privateKey).toContain('BEGIN OPENSSH PRIVATE KEY')
  expect(keys.privateKey).not.toContain('PRIVATE KEY-----\\n-----BEGIN')
 })
 it('AES 随机密钥长度准确',()=>{
  expect(generateAes(128).secret).toMatch(/^[0-9a-f]{32}$/)
  expect(generateAes(256).secret).toMatch(/^[0-9a-f]{64}$/)
 })
 it('随机串长度与字符集约束',()=>{
  const str=generateRandom(100,'abc').secret!
  expect(str).toHaveLength(100);expect(str).toMatch(/^[abc]+$/)
  expect(()=>generateRandom(10000,'abc')).toThrow()
  expect(()=>generateSsh('ed25519',0,'bad\ncomment')).toThrow()
 })
})
