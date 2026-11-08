import {describe,expect,it} from 'vitest'
import {getAudioWaveformViewport} from '../src/lib/audio-editing/waveform-viewport'

describe('音频波形缩放的整数微秒范围',()=>{
 it('音轨时长不能被缩放倍数整除时，仍然只传 safeint',()=>{
  const durationUs=4_000_001
  for(const zoom of [1,2,3,4,5,7,8,16,31,32,1.5]){
   const range=getAudioWaveformViewport(durationUs,zoom,0)
   expect(Number.isSafeInteger(range.startUs)).toBe(true)
   expect(Number.isSafeInteger(range.endUs)).toBe(true)
   expect(range.endUs).toBeGreaterThan(range.startUs)
   expect(range.endUs).toBeLessThanOrEqual(durationUs)
   expect(range.visibleUs).toBe(range.endUs-range.startUs)
  }
  expect(getAudioWaveformViewport(durationUs,3,0).endUs).toBe(1_333_334)
 })
 it('滚动至结尾、越界、NaN 或小数起点均规范化，并且末段覆盖最后一个采样点',()=>{
  const durationUs=8_500_003
  const viewport=getAudioWaveformViewport(durationUs,3,durationUs)
  expect(viewport.startUs).toBe(durationUs-viewport.visibleUs)
  expect(viewport.endUs).toBe(durationUs)
  expect(getAudioWaveformViewport(durationUs,3,12_345.67).startUs).toBe(12_345)
  expect(getAudioWaveformViewport(durationUs,3,Number.NaN).startUs).toBe(0)
  expect(getAudioWaveformViewport(durationUs,3,-1).startUs).toBe(0)
 })
 it('未缩放时展示完整音轨；极短有效音轨不会产生空范围',()=>{
  expect(getAudioWaveformViewport(10_000,1,5_000)).toEqual({startUs:0,endUs:10_000,visibleUs:10_000,maxStartUs:0})
  expect(getAudioWaveformViewport(10_000,32,9_999)).toEqual({startUs:9_687,endUs:10_000,visibleUs:313,maxStartUs:9_687})
  expect(()=>getAudioWaveformViewport(0,2,0)).toThrow('音频时长无效')
 })
})
