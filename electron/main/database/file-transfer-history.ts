import path from 'node:path'
import {randomUUID} from 'node:crypto'
import type Database from './sqlite'
import type {ShareHistory} from '../../../src/shared/fileTransferModels'

const normalize=(p:string)=>path.normalize(path.resolve(p)).replace(/[\\/]+$/, '')
const map=(item:Record<string,unknown>):ShareHistory=>({
 id:String(item.id),path:String(item.normalized_path),name:String(item.display_name),
 kind:item.kind==='directory'?'directory':'file',createdAt:Number(item.created_at),lastUsedAt:Number(item.last_used_at)
})
export function listShareHistory(db:Database,search=''):ShareHistory[]{
 const rows=db.prepare('SELECT * FROM file_transfer_share_history ORDER BY last_used_at DESC, id DESC LIMIT 300').all() as Record<string,unknown>[]
 const q=search.trim().toLocaleLowerCase()
 return rows.map(map).filter(x=>!q||(x.name+' '+x.path).toLocaleLowerCase().includes(q))
}
export function saveShareHistory(db:Database,p:string,kind:'file'|'directory') {
 const normalized=normalize(p),now=Date.now()
 db.transaction(()=>{
  db.prepare(`INSERT INTO file_transfer_share_history(id,normalized_path,display_name,kind,created_at,last_used_at)
   VALUES (?,?,?,?,?,?) ON CONFLICT(normalized_path) DO UPDATE SET
   display_name=excluded.display_name,kind=excluded.kind,last_used_at=excluded.last_used_at`)
   .run(randomUUID(),normalized,path.basename(normalized),kind,now,now)
  db.prepare(`DELETE FROM file_transfer_share_history WHERE id NOT IN
   (SELECT id FROM file_transfer_share_history ORDER BY last_used_at DESC,id DESC LIMIT 300)`).run()
 })()
}
export function removeShareHistory(db:Database,id:string) {
 db.prepare('DELETE FROM file_transfer_share_history WHERE id=?').run(id)
}
export function clearShareHistory(db:Database) {
 db.prepare('DELETE FROM file_transfer_share_history').run()
}
export function getShareHistory(db:Database,ids:string[]) {
 const found=new Map(listShareHistory(db).map(x=>[x.id,x]))
 return ids.map(id=>found.get(id)).filter((x):x is ShareHistory=>Boolean(x))
}
