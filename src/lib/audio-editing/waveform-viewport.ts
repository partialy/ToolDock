/**
 * 波形预览请求必须始终使用整数微秒，和主进程 audio:peaks 的校验规则一致。
 * 缩放比例可能无法整除总时长，向上取整避免丢失最后的采样区间。
 */
export interface AudioWaveformViewport {
 startUs:number
 endUs:number
 visibleUs:number
 maxStartUs:number
}

export function getAudioWaveformViewport(durationUs:number,zoom:number,viewStartUs:number):AudioWaveformViewport{
 if(!Number.isSafeInteger(durationUs)||durationUs<=0)throw new Error('音频时长无效')
 const safeZoom=Number.isFinite(zoom)?Math.max(1,Math.min(32,zoom)):1
 const visibleUs=Math.min(durationUs,Math.max(1,Math.ceil(durationUs/safeZoom)))
 const maxStartUs=durationUs-visibleUs
 const requestedStart=Number.isFinite(viewStartUs)?Math.trunc(viewStartUs):0
 const startUs=Math.max(0,Math.min(maxStartUs,requestedStart))
 return {startUs,endUs:startUs+visibleUs,visibleUs,maxStartUs}
}
