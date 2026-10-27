import {MAX_INPUT_BYTES,MAX_STEP_BYTES,MAX_STEPS,assertTextScalar,stepSchema,type CodecStep} from '../../shared/codecModels'
import {convertText} from './index'
const enc=new TextEncoder()
export type Stage={id:string;index:number;label:string;status:'ok'|'error'|'skipped'|'not-run';inputBytes:number;outputBytes:number;durationMs:number;preview:string;error?:string}
export type RunResult={stages:Stage[];finalValue:string|null;selectedValue?:string;error?:{index:number;id:string;message:string};durationMs:number}
export function runPipeline(input:string,steps:CodecStep[],selectedStepId?:string):RunResult{
 assertTextScalar(input)
 if(enc.encode(input).length>MAX_INPUT_BYTES)throw Error('输入文本不能超过 2 MiB')
 if(steps.length>MAX_STEPS)throw Error('流水线步骤不能超过 20 个')
 const start=performance.now(),stages:Stage[]=[]
 let current=input,failed=false,error:RunResult['error'],selectedValue:string|undefined
 for(let i=0;i<steps.length;i++){
  const s=stepSchema.parse(steps[i]),t=performance.now(),before=enc.encode(current).length
  if(failed){stages.push({id:s.id,index:i,label:s.kind,status:'not-run',inputBytes:0,outputBytes:0,durationMs:0,preview:''});continue}
  if(!s.enabled){stages.push({id:s.id,index:i,label:s.kind,status:'skipped',inputBytes:before,outputBytes:before,durationMs:0,preview:current.slice(0,4096)});if(s.id===selectedStepId)selectedValue=current;continue}
  try{
   current=convertText(current,s)
   const after=enc.encode(current).length
   if(after>MAX_STEP_BYTES)throw Error('步骤输出超过 8 MiB')
   stages.push({id:s.id,index:i,label:s.kind,status:'ok',inputBytes:before,outputBytes:after,durationMs:performance.now()-t,preview:current.slice(0,4096)})
   if(s.id===selectedStepId)selectedValue=current
  }catch(e){failed=true;const message=e instanceof Error?e.message:'转换失败'
   error={index:i,id:s.id,message};stages.push({id:s.id,index:i,label:s.kind,status:'error',inputBytes:before,outputBytes:0,durationMs:performance.now()-t,preview:'',error:message})
  }
 }
 return {stages,finalValue:failed?null:current,selectedValue,error,durationMs:performance.now()-start}
}
