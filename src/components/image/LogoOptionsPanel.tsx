import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {clampCornerRadiusPercent,type CropRect,type FitMode} from '@/lib/image/geometry'
import {LogoRoundPreview} from './LogoRoundPreview'

const LOGO_SIZES=[16,24,32,48,64,128,256,512,1024] as const
const OUTPUT_FORMATS=['png','jpeg','webp','ico'] as const
const RADIUS_PRESETS=[
 {label:'直角 0%',value:0},
 {label:'微圆角 16%',value:16},
 {label:'App 22%',value:22},
 {label:'正圆 50%',value:50}
] as const

export interface LogoOptionsPanelProps{
 previewItem?:{preview:string;fileName:string;stem:string;crop?:CropRect}
 logoFit:FitMode
 onLogoFitChange:(fit:FitMode)=>void
 cornerRadiusPercent:number
 onCornerRadiusChange:(percent:number)=>void
 dualRoundOutput:boolean
 onDualRoundOutputChange:(enabled:boolean)=>void
 selectedSizes:number[]
 onToggleSize:(size:number)=>void
 selectedFormats:string[]
 onToggleFormat:(format:string)=>void
 disabled?:boolean
}

/**
 * Logo / ICO 模式专属参数面板：实时预览、适应方式、0–50% 圆角、独立 _round 输出与尺寸格式选择。
 */
export function LogoOptionsPanel({
 previewItem,
 logoFit,
 onLogoFitChange,
 cornerRadiusPercent,
 onCornerRadiusChange,
 dualRoundOutput,
 onDualRoundOutputChange,
 selectedSizes,
 onToggleSize,
 selectedFormats,
 onToggleFormat,
 disabled
}:LogoOptionsPanelProps){
 const clampedRadius=clampCornerRadiusPercent(cornerRadiusPercent)
 const hasJpeg=selectedFormats.includes('jpeg')
 const jpegOnly=hasJpeg&&selectedFormats.length===1

 return (
  <div className="space-y-4">
   <LogoRoundPreview
    previewUrl={previewItem?.preview}
    previewName={previewItem?.fileName}
    stem={previewItem?.stem}
    crop={previewItem?.crop}
    fit={logoFit}
    radiusPercent={clampedRadius}
    dualRoundOutput={dualRoundOutput}
    jpegOnly={jpegOnly}
   />

   <div className="space-y-1.5">
    <div className="text-xs muted">画布适应方式</div>
    <SelectField
     ariaLabel="画布适应方式"
     value={logoFit}
     disabled={disabled}
     onValueChange={v=>onLogoFitChange(v as FitMode)}
     options={[
      {value:'cover',label:'居中裁切铺满（推荐切圆角）',description:'自动填满正方形画布，非 1:1 图片也可直接切出饱满圆角或正圆'},
      {value:'contain',label:'等比适应留白',description:'完整保留源图内容，短边保留透明留白'}
     ]}
     className="w-full"
    />
   </div>

   <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)]/55 p-3">
    <div className="flex items-center justify-between gap-3">
     <span className="text-xs font-medium">圆角弧度 <span className="font-normal muted">（50% 即正圆）</span></span>
     <div className="flex items-center gap-1.5">
      <Input
       type="number"
       aria-label="圆角弧度百分比"
       min={0}
       max={50}
       disabled={disabled}
       value={clampedRadius}
       onChange={e=>onCornerRadiusChange(clampCornerRadiusPercent(Number(e.target.value)))}
       className="h-8 w-16 px-2 text-center text-xs tabular-nums"
      />
      <span className="text-xs muted">%</span>
     </div>
    </div>

    <input
     aria-label="圆角弧度滑块"
     type="range"
     min={0}
     max={50}
     step={1}
     disabled={disabled}
     value={clampedRadius}
     onChange={e=>onCornerRadiusChange(clampCornerRadiusPercent(Number(e.target.value)))}
     className="w-full"
    />

    <div className="flex flex-wrap gap-1.5">
     {RADIUS_PRESETS.map(p=>(
      <button
       key={p.value}
       type="button"
       disabled={disabled}
       onClick={()=>onCornerRadiusChange(p.value)}
       className={'rounded-lg border px-2.5 py-1 text-[11px] transition-colors '+(clampedRadius===p.value?'border-[var(--primary)] bg-[var(--selected)] font-medium text-[var(--primary)]':'border-[var(--border)] bg-[var(--panel)] muted hover:text-[var(--foreground)]')}
      >
       {p.label}
      </button>
     ))}
    </div>

    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
     <div className="min-w-0">
      <div className="text-xs font-medium">同时输出直角原版与圆角版</div>
      <p className="mt-0.5 text-[11px] muted">开启且圆角 &gt; 0% 时，额外生成独立 <code className="text-[var(--foreground)]">_round</code> 文件</p>
     </div>
     <SwitchField
      ariaLabel="同时输出直角原版与圆角版"
      checked={dualRoundOutput}
      disabled={disabled}
      onCheckedChange={onDualRoundOutputChange}
     />
    </div>
   </div>

   <div className="space-y-2">
    <div className="text-xs muted">选择尺寸（px）</div>
    <div className="flex flex-wrap gap-2">
     {LOGO_SIZES.map(s=>(
      <button
       key={s}
       type="button"
       disabled={disabled}
       onClick={()=>onToggleSize(s)}
       className={'rounded-lg border px-3 py-2 text-xs '+(selectedSizes.includes(s)?'border-[var(--primary)] bg-[var(--selected)] text-[var(--primary)]':'border-[var(--border)]')}
      >
       {s}
      </button>
     ))}
    </div>
   </div>

   <div className="space-y-2">
    <div className="text-xs muted">输出格式</div>
    <div className="flex flex-wrap gap-2">
     {OUTPUT_FORMATS.map(f=>(
      <button
       key={f}
       type="button"
       disabled={disabled}
       onClick={()=>onToggleFormat(f)}
       className={'rounded-lg border px-3 py-2 text-xs '+(selectedFormats.includes(f)?'border-[var(--primary)] bg-[var(--selected)] text-[var(--primary)]':'border-[var(--border)]')}
      >
       {f==='jpeg'?'JPEG':f.toUpperCase()}
      </button>
     ))}
    </div>
   </div>

   <p className="text-xs muted">ICO 自动组合全部不超过 256px 的选中尺寸；512/1024px 仅以普通图片导出。</p>
   {hasJpeg&&clampedRadius>0&&(
    <p className="text-xs text-amber-400">JPEG 不支持透明通道，圆角外区域将填充白色；透明圆角建议选择 PNG / WebP / ICO。</p>
   )}
  </div>
 )
}
