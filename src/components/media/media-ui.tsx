import type {ReactNode} from 'react'

export const MEDIA_CARD='min-w-0 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5'
export const mediaError=(error:unknown)=>error instanceof Error?error.message:String(error)
export const mediaName=(path:string)=>path.split(/[\\/]/).pop()||path
export const mediaBytes=(n:number)=>n>=1024**3?(n/1024**3).toFixed(2)+' GiB':n>=1024**2?(n/1024**2).toFixed(1)+' MiB':(n/1024).toFixed(1)+' KiB'
export function MediaField({label,children}:{label:string;children:ReactNode}){
 return <div className="min-w-0 space-y-2"><div className="text-xs font-medium muted">{label}</div>{children}</div>
}
export function MediaProgress({value,label}:{value:number;label:string}){
 const percent=Math.max(0,Math.min(100,Number.isFinite(value)?value:0))
 return <div role="progressbar" aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-[var(--panel-alt)]"><div className="h-full rounded-full bg-indigo-500 transition-[width] duration-200" style={{width:percent+'%'}}/></div>
}
