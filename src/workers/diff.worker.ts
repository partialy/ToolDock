/// <reference lib="webworker" />
import {compareDocuments,type DiffMode} from '../lib/diff/compare'
self.onmessage=(event:MessageEvent<{id:number;left:string;right:string;mode:DiffMode;ignoreKeyOrder:boolean}>)=>{
 const {id,left,right,mode,ignoreKeyOrder}=event.data
 try{self.postMessage({id,ok:true,result:compareDocuments(left,right,mode,ignoreKeyOrder)})}
 catch(error){self.postMessage({id,ok:false,error:error instanceof Error?error.message:String(error)})}
}
export {}
