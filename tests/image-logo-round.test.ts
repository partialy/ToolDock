import {describe,expect,it,vi} from 'vitest'
import {clampCornerRadiusPercent,cornerRadiusPx,fitRect} from '../src/lib/image/geometry'
import {buildLogoVariants,drawFittedImage,generateLogoOutputs,type Canvas2DContext,type DrawableImageSource} from '../src/lib/image/logo-render'

function createValidPngStub(size:number){
 const data=new Uint8Array(new ArrayBuffer(24))
 data.set([137,80,78,71,13,10,26,10],0)
 const view=new DataView(data.buffer)
 view.setUint32(16,size,false)
 view.setUint32(20,size,false)
 return data
}

describe('Logo / ICO 圆角几何与独立导出逻辑',()=>{
 it('圆角比例边界截断与半径换算正确（50% 为正圆）',()=>{
  expect(clampCornerRadiusPercent(-10)).toBe(0)
  expect(clampCornerRadiusPercent(Number.NaN)).toBe(0)
  expect(clampCornerRadiusPercent(22.4)).toBe(22)
  expect(clampCornerRadiusPercent(80)).toBe(50)

  expect(cornerRadiusPx(256,0)).toBe(0)
  expect(cornerRadiusPx(256,25)).toBe(64)
  expect(cornerRadiusPx(256,50)).toBe(128)
  expect(cornerRadiusPx(0,50)).toBe(0)
 })

 it('非正方形原图在 cover 与 contain 下的适配计算正确',()=>{
  const covered=fitRect(1600,800,256,256,'cover')
  expect(covered).toEqual({sx:400,sy:0,sw:800,sh:800,dx:0,dy:0,dw:256,dh:256})

  const contained=fitRect(1600,800,256,256,'contain')
  expect(contained).toEqual({sx:0,sy:0,sw:1600,sh:800,dx:0,dy:64,dw:256,dh:128})
 })

 it('buildLogoVariants 按开关与弧度正确规划单套或双套输出',()=>{
  expect(buildLogoVariants('app',0,false)).toEqual([
   {stem:'app',radiusPercent:0,isRoundVariant:false}
  ])
  expect(buildLogoVariants('app',22,false)).toEqual([
   {stem:'app',radiusPercent:22,isRoundVariant:true}
  ])
  expect(buildLogoVariants('app',0,true)).toEqual([
   {stem:'app',radiusPercent:0,isRoundVariant:false}
  ])
  expect(buildLogoVariants('app',50,true)).toEqual([
   {stem:'app',radiusPercent:0,isRoundVariant:false},
   {stem:'app_round',radiusPercent:50,isRoundVariant:true}
  ])
 })

 it('generateLogoOutputs 支持双套 PNG + 多帧 ICO 并正确命名 _round 文件',async()=>{
  const calls:{size:number;format:string;radiusPercent:number}[]=[]
  const outputs=await generateLogoOutputs({
   stem:'tooldock',
   sizes:[16,256,512],
   formats:['png','ico'],
   cornerRadiusPercent:25,
   dualRoundOutput:true,
   renderBlob:async(size,format,radiusPercent)=>{
    calls.push({size,format,radiusPercent})
    return new Blob([createValidPngStub(size)],{type:'image/png'})
   }
  })

  expect(outputs.map(o=>({name:o.name,variant:o.variant,radius:o.radiusPercent}))).toEqual([
   {name:'tooldock_16x16.png',variant:'default',radius:0},
   {name:'tooldock_256x256.png',variant:'default',radius:0},
   {name:'tooldock_512x512.png',variant:'default',radius:0},
   {name:'tooldock.ico',variant:'default',radius:0},
   {name:'tooldock_round_16x16.png',variant:'round',radius:25},
   {name:'tooldock_round_256x256.png',variant:'round',radius:25},
   {name:'tooldock_round_512x512.png',variant:'round',radius:25},
   {name:'tooldock_round.ico',variant:'round',radius:25}
  ])

  const icoOutputs=outputs.filter(o=>o.format==='ico')
  expect(icoOutputs).toHaveLength(2)
  expect(icoOutputs.every(o=>o.blob.size>0)).toBe(true)
  expect(calls.some(c=>c.size===512&&c.radiusPercent===25)).toBe(true)
 })

 it('drawFittedImage 在圆角 > 0 时调用 roundRect + clip，在 0% 时不裁剪圆角',()=>{
  const makeMockCtx=()=>{
   const roundRect=vi.fn()
   const clip=vi.fn()
   const fillRect=vi.fn()
   const drawImage=vi.fn()
   const ctx={
    clearRect:vi.fn(),
    fillRect,
    save:vi.fn(),
    restore:vi.fn(),
    beginPath:vi.fn(),
    roundRect,
    clip,
    drawImage,
    fillStyle:'',
    imageSmoothingEnabled:false,
    imageSmoothingQuality:'low'
   }
   return {ctx:ctx as unknown as Canvas2DContext,roundRect,clip,fillRect,drawImage}
  }

  const fakeSource={} as DrawableImageSource
  const rounded=makeMockCtx()
  drawFittedImage({
   ctx:rounded.ctx,
   source:fakeSource,
   sourceWidth:400,
   sourceHeight:200,
   width:200,
   height:200,
   fit:'cover',
   radiusPercent:50
  })
  expect(rounded.roundRect).toHaveBeenCalledWith(0,0,200,200,100)
  expect(rounded.clip).toHaveBeenCalledTimes(1)
  expect(rounded.drawImage).toHaveBeenCalledWith(fakeSource,100,0,200,200,0,0,200,200)

  const sharp=makeMockCtx()
  drawFittedImage({
   ctx:sharp.ctx,
   source:fakeSource,
   sourceWidth:200,
   sourceHeight:200,
   width:200,
   height:200,
   fit:'cover',
   radiusPercent:0,
   fillBackground:'#fff'
  })
  expect(sharp.fillRect).toHaveBeenCalledWith(0,0,200,200)
  expect(sharp.roundRect).not.toHaveBeenCalled()
  expect(sharp.clip).not.toHaveBeenCalled()
 })
})
