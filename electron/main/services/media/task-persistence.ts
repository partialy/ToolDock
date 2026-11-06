import type Database from '../../database/sqlite'
import type {MediaTask} from '../../../../src/shared/mediaModels'

export function loadMediaTasks(db:Database):MediaTask[]{
 const rows=db.prepare("SELECT metadata_json FROM media_tasks WHERE state IN ('ready','queued','running') UNION ALL SELECT metadata_json FROM (SELECT metadata_json FROM media_tasks WHERE state NOT IN ('ready','queued','running') ORDER BY created_at DESC LIMIT 100)").all()
 const tasks:MediaTask[]=[]
 for(const row of rows){try{const t=JSON.parse(String(row.metadata_json)) as MediaTask;if(!/^[0-9a-f-]{36}$/.test(t.id)||!['extract','subtitle'].includes(t.kind)||typeof t.inputPath!=='string'||typeof t.outputPath!=='string'||typeof t.createdAt!=='number'||!t.probe||!Array.isArray(t.probe.audioTracks)||!['ready','queued','running','completed','failed','cancelled','interrupted'].includes(t.state))continue;if(['running','queued'].includes(t.state)){t.state='interrupted';t.error='上次运行意外中断，请手动重试';t.finishedAt=Date.now()}tasks.push(t)}catch{/* 损坏记录不进入执行队列。 */}}
 tasks.sort((a,b)=>b.createdAt-a.createdAt)
 return tasks
}
export function saveMediaTask(db:Database,t:MediaTask){
 db.prepare(`INSERT INTO media_tasks (id,kind,input_path,output_path,source_audio_index,state,percent,error_summary,created_at,updated_at,finished_at,attempts,metadata_json)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET output_path=excluded.output_path,source_audio_index=excluded.source_audio_index,state=excluded.state,percent=excluded.percent,error_summary=excluded.error_summary,updated_at=excluded.updated_at,finished_at=excluded.finished_at,attempts=excluded.attempts,metadata_json=excluded.metadata_json`).run(t.id,t.kind,t.inputPath,t.outputPath,t.audioIndex,t.state,t.percent,t.error,t.createdAt,t.updatedAt,t.finishedAt??null,t.attempts,JSON.stringify(t))
 db.prepare("DELETE FROM media_tasks WHERE state IN ('completed','failed','cancelled','interrupted') AND id NOT IN (SELECT id FROM media_tasks WHERE state IN ('completed','failed','cancelled','interrupted') ORDER BY created_at DESC LIMIT 100)").run()
}
