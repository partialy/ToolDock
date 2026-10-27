import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {codecKinds,kindLabels,makeStep,type CodecKind,type CodecStep,type CodecDirection} from '@/shared/codecModels'
const variants={base64:[['standard','标准 Base64'],['url','URL Safe'],['auto','自动识别（仅解码）']],url:[['component','URL 参数值'],['uri','完整 URL'],['form','Form 表单值']],unicode:[['js','JavaScript \\uXXXX'],['es6','ES6 \\u{...}'],['codepoint','U+ 码点']],hex:[['space','空格分隔'],['compact','连续 Hex'],['0x','0x 前缀'],['slash-x','\\x 前缀']],'html-entity':[['basic','HTML 基础实体'],['decimal','十进制数字实体'],['hex','十六进制数字实体']],binary:[['space','空格分隔'],['compact','连续字节']],'json-escape':[]} as const
type Props={step:CodecStep;onChange:(s:CodecStep)=>void;compact?:boolean}
export function CodecStepOptions({step,onChange,compact}:Props){
 const modify=(changes:Partial<CodecStep>)=>onChange({...step,...changes})
 const changeKind=(kind:CodecKind)=>{const next=makeStep(kind,step.direction);modify({kind,options:next.options})}
 const changeDirection=(direction:CodecDirection)=>{
  const options={...step.options}
  if(step.kind==='base64'&&direction==='encode'&&options.variant==='auto')options.variant='standard'
  modify({direction,options})
 }
 const opts=variants[step.kind] as readonly (readonly [string,string])[]
 const optionKey=step.kind==='base64'?'variant':step.kind==='url'?'mode':'format'
 return <div className={'flex flex-wrap items-center gap-2 '+(compact?'':'py-1')}>
  <SelectField ariaLabel="编码类型" className="min-w-[128px]" value={step.kind} onValueChange={v=>changeKind(v as CodecKind)} options={codecKinds.map(kind=>({value:kind,label:kindLabels[kind]}))}/>
  <SelectField ariaLabel="转换方向" value={step.direction} onValueChange={v=>changeDirection(v as CodecDirection)} options={[{value:'encode',label:'编码'},{value:'decode',label:'解码'}]}/>
  {opts.length>0&&!(step.direction==='decode'&&['hex','html-entity','binary'].includes(step.kind))&&<SelectField ariaLabel="编码格式" className="min-w-[155px]" value={String(step.options[optionKey]||opts[0][0])} onValueChange={v=>modify({options:{...step.options,[optionKey]:v}})} options={opts.filter(v=>!(step.kind==='base64'&&step.direction==='encode'&&v[0]==='auto')).map(([value,label])=>({value,label}))}/>}
  {step.kind==='base64'&&step.direction==='encode'&&<label className="flex items-center gap-2 text-xs muted">保留填充 <SwitchField ariaLabel="保留 Base64 等号填充" checked={step.options.padded!==false} onCheckedChange={v=>modify({options:{...step.options,padded:v}})}/></label>}
  {step.kind==='hex'&&step.direction==='encode'&&<label className="flex items-center gap-2 text-xs muted">大写 Hex <SwitchField ariaLabel="大写 Hex" checked={step.options.uppercase!==false} onCheckedChange={v=>modify({options:{...step.options,uppercase:v}})}/></label>}
 </div>
}
