import {useEffect} from 'react'
import {useReducedMotion} from 'motion/react'
import type {Settings} from '@/types/models'

const runningLabel='文件快传运行中',stoppedLabel='文件快传关闭'
export function FileTransferStatusPill({running,motion,onClick}:{running:boolean;motion:Settings['motion'];onClick:()=>void}){
 const prefersReduced=useReducedMotion()
 const animate=running&&motion==='normal'&&!prefersReduced
 const label=running?runningLabel:stoppedLabel
 return <button type="button" onClick={onClick} title={label} aria-label={label}
  className={'transfer-pill inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors '+(running?'border-emerald-500/30 bg-emerald-500/10 text-emerald-500':'border-[var(--border)] bg-[var(--panel-alt)] text-[var(--muted)]')+(animate?' is-animated':'')}>
  <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
   <path className="transfer-icon-lines" strokeDasharray="14" d="M17 15l0 -11.5M7 9l0 11.5"/>
   <path className="transfer-icon-arrows" strokeDasharray="8" d="M17 3l-4 4M17 3l4 4M7 21l-4 -4M7 21l4 -4"/>
  </svg>
  <span className="transfer-pill-label whitespace-nowrap" aria-hidden="true">{Array.from(label).map((letter,i)=><span key={i} className="transfer-letter" style={{animationDelay:(i*0.1)+'s'}}>{letter}</span>)}</span>
 </button>
}
