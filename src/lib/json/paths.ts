export function childJsonPath(base:string,key:string|number){
 if(typeof key==='number')return base+'['+key+']'
 return /^[A-Za-z_$][\w$]*$/.test(key)?base+'.'+key:base+'['+JSON.stringify(key)+']'
}
