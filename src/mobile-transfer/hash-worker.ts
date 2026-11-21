import {sha256} from '@noble/hashes/sha2.js'
import {bytesToHex} from '@noble/hashes/utils.js'

type HashRequest={id:number;buffer:ArrayBuffer}

self.onmessage=(event:MessageEvent<HashRequest>)=>{
 const {id,buffer}=event.data
 const digest=bytesToHex(sha256(new Uint8Array(buffer)))
 self.postMessage({id,digest,buffer},{transfer:[buffer]})
}
