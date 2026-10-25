declare module 'bcrypt-pbkdf' {
 export function pbkdf(password:Buffer,passLength:number,salt:Buffer,saltLength:number,output:Buffer,outputLength:number,rounds:number):number
}
