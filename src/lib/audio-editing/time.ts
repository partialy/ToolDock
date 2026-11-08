import type {AudioRange,AudioEdit} from '@/shared/audioEditingModels'
export function formatAudioTime(us:number){
 const t=Math.max(0,Math.round(us/10000)),cent=t%100,sec=Math.floor(t/100)%60,min=Math.floor(t/6000)%60,hour=Math.floor(t/360000)
 return [hour,min,sec].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(cent).padStart(2,'0')
}
export function parseAudioTime(text:string){
 const value=text.trim()
 if(!value)return null
 const parts=value.split(':')
 if(parts.length>3||parts.some(p=>!/^\d+(?:\.\d{1,2})?$/.test(p)))return null
 const seconds=parts.reduce((acc,n)=>acc*60+Number(n),0)
 const micro=Math.round(seconds*1e6)
 return Number.isSafeInteger(micro)?micro:null
}
export function deletedRanges(kept:AudioRange[],durationUs:number):AudioRange[]{
 const result:AudioRange[]=[];let last=0
 for(const segment of kept){if(segment.startUs>last)result.push({startUs:last,endUs:segment.startUs});last=segment.endUs}
 if(last<durationUs)result.push({startUs:last,endUs:durationUs})
 return result
}
export function toOriginalTime(outputUs:number,edit:AudioEdit){
 let elapsed=0
 for(let i=0;i<edit.kept.length;i++){
  const range=edit.kept[i]
  const cross=i?Math.min(edit.fadeMs*1000,(range.endUs-range.startUs)/2,(edit.kept[i-1].endUs-edit.kept[i-1].startUs)/2):0
  elapsed-=cross
  const length=range.endUs-range.startUs
  if(outputUs<=elapsed+length)return Math.max(range.startUs,Math.min(range.endUs,range.startUs+outputUs-elapsed))
  elapsed+=length
 }
 return edit.kept.at(-1)?.endUs||0
}
export function toOutputTime(originalUs:number,edit:AudioEdit){
 let elapsed=0
 for(let i=0;i<edit.kept.length;i++){
  const r=edit.kept[i]
  if(i)elapsed-=Math.min(edit.fadeMs*1000,(r.endUs-r.startUs)/2,(edit.kept[i-1].endUs-edit.kept[i-1].startUs)/2)
  if(originalUs<r.startUs)return Math.max(0,elapsed)
  if(originalUs<=r.endUs)return Math.max(0,elapsed+originalUs-r.startUs)
  elapsed+=r.endUs-r.startUs
 }
 return elapsed
}
