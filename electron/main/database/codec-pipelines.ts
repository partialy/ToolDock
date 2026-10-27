import {randomUUID} from 'node:crypto'
import type Database from './sqlite'
import {MAX_SAVED,pipelineInputSchema,pipelineIdSchema,stepSchema,type PipelineInput,type PipelineSaved,type PipelineSummary} from '../../../src/shared/codecModels'
import {z} from 'zod'
type Row={id:string;name:string;description:string;steps_json:string;revision:number;created_at:string;updated_at:string}
const toSaved=(r:Row):PipelineSaved=>{
 const parsed=z.array(stepSchema).max(20).parse(JSON.parse(r.steps_json))
 pipelineInputSchema.parse({name:r.name,description:r.description,steps:parsed})
 return {id:r.id,name:r.name,description:r.description,steps:parsed,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at}
}
const toSummary=(r:Row&{step_count?:number}):PipelineSummary=>({id:r.id,name:r.name,description:r.description,revision:r.revision,createdAt:r.created_at,updatedAt:r.updated_at,stepCount:JSON.parse(r.steps_json).length as number})
export function listCodecPipelines(db:Database):PipelineSummary[]{
 return (db.prepare('SELECT * FROM codec_pipelines ORDER BY updated_at DESC,id ASC').all() as unknown as Row[]).map(toSummary)
}
export function getCodecPipeline(db:Database,id:string):PipelineSaved{
 const r=db.prepare('SELECT * FROM codec_pipelines WHERE id=?').get(pipelineIdSchema.parse(id)) as unknown as Row|undefined
 if(!r)throw Error('流程配置不存在')
 return toSaved(r)
}
export function createCodecPipeline(db:Database,input:PipelineInput):PipelineSaved{
 const data=pipelineInputSchema.parse(input)
 return db.transaction(()=>{
  const count=(db.prepare('SELECT COUNT(*) AS n FROM codec_pipelines').get() as {n:number}).n
  if(count>=MAX_SAVED)throw Error('最多保存 200 份流程')
  const id=randomUUID(),now=new Date().toISOString()
  db.prepare('INSERT INTO codec_pipelines(id,name,description,schema_version,steps_json,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,data.name,data.description,1,JSON.stringify(data.steps),1,now,now)
  return getCodecPipeline(db,id)
 })()
}
export function updateCodecPipeline(db:Database,id:string,expectedRevision:number,input:PipelineInput):PipelineSaved{
 pipelineIdSchema.parse(id)
 const data=pipelineInputSchema.parse(input)
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw Error('无效的配置版本')
 return db.transaction(()=>{
  const change=db.prepare('UPDATE codec_pipelines SET name=?,description=?,steps_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
   .run(data.name,data.description,JSON.stringify(data.steps),new Date().toISOString(),id,expectedRevision)
  if(!change.changes)throw Error('流程配置已更新或删除，请重新加载或另存为')
  return getCodecPipeline(db,id)
 })()
}
export function duplicateCodecPipeline(db:Database,id:string,newName?:string):PipelineSaved{
 const old=getCodecPipeline(db,id)
 return createCodecPipeline(db,{name:newName?.trim()||((old.name+' 副本').slice(0,80)),description:old.description,steps:old.steps.map(s=>({...s,id:randomUUID()}))})
}
export function removeCodecPipeline(db:Database,id:string,expectedRevision?:number):void{
 pipelineIdSchema.parse(id)
 if(expectedRevision!==undefined&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<1))throw Error('无效的配置版本')
 const sql=expectedRevision===undefined?'DELETE FROM codec_pipelines WHERE id=?':'DELETE FROM codec_pipelines WHERE id=? AND revision=?'
 const result=db.prepare(sql).run(...(expectedRevision===undefined?[id]:[id,expectedRevision]))
 if(!result.changes)throw Error('流程配置已更新或删除，请重新加载')
}
