import {useCallback,useEffect,useMemo,useState} from 'react'
import {DndContext,closestCenter,type DragEndEvent} from '@dnd-kit/core'
import {SortableContext,arrayMove,verticalListSortingStrategy} from '@dnd-kit/sortable'
import {
 AlertTriangle,
 ArrowDown,
 ArrowUp,
 ArrowUpDown,
 CheckSquare,
 FolderOpen,
 FolderPlus,
 Plus,
 RotateCcw,
 Search,
 Square,
 Trash2
} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {SelectField} from '@/components/ui/select-field'
import {SwitchField} from '@/components/ui/switch-field'
import {ToolPageIcon} from '@/components/ui/tool-page-icon'
import {useDialog} from '@/components/ui/dialog-provider'
import {msg} from '@/components/ui/message'
import {DropOverlay,useWindowFileDrop} from '@/hooks/useWindowFileDrop'
import {RenameStepCard} from '@/components/batch-rename/RenameStepCard'
import {RenamePresetDialog} from '@/components/batch-rename/RenamePresetDialog'
import {
 previewBatchRename,
 sortRenameEntries,
 type RenameSortBy,
 type RenameSortDir
} from '@/lib/batch-rename/rename-engine'
import {
 MAX_RENAME_FILES,
 MAX_RENAME_STEPS,
 defaultExtensionPolicy,
 makeRenameStep,
 renamePresetInputSchema,
 type ExtensionMode,
 type ExtensionPolicy,
 type RenameFileEntry,
 type RenamePresetSaved,
 type RenamePresetSummary,
 type RenameStep,
 type RenameStepKind
} from '@/shared/batchRenameModels'

const CARD='rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4'

function splitLocalName(name:string):{stem:string;ext:string}{
 const dot=name.lastIndexOf('.')
 if(dot<=0)return {stem:name,ext:''}
 return {stem:name.slice(0,dot),ext:name.slice(dot)}
}

function joinPath(dir:string,name:string):string{
 const sep=dir.includes('\\')?'\\':'/'
 return dir.endsWith(sep)?`${dir}${name}`:`${dir}${sep}${name}`
}

export function BatchRenamePage(){
 const dialog=useDialog()
 const [entries,setEntries]=useState<RenameFileEntry[]>([])
 const [checkedIds,setCheckedIds]=useState<Set<string>>(()=>new Set())
 const [includeSubdirs,setIncludeSubdirs]=useState(false)
 const [sortBy,setSortBy]=useState<RenameSortBy>('name')
 const [sortDir,setSortDir]=useState<RenameSortDir>('asc')
 const [filterQuery,setFilterQuery]=useState('')
 const [steps,setSteps]=useState<RenameStep[]>(()=>[makeRenameStep('template')])
 const [extensionPolicy,setExtensionPolicy]=useState<ExtensionPolicy>({...defaultExtensionPolicy})
 const [busy,setBusy]=useState(false)
 const [canUndo,setCanUndo]=useState(false)
 const [undoRestoreMap,setUndoRestoreMap]=useState<Map<string,{path:string;name:string;stem:string;ext:string}>|null>(null)
 const [presets,setPresets]=useState<RenamePresetSummary[]>([])
 const [currentPreset,setCurrentPreset]=useState<RenamePresetSaved|null>(null)
 const [draftName,setDraftName]=useState('')
 const [draftDescription,setDraftDescription]=useState('')
 const [presetDialogOpen,setPresetDialogOpen]=useState(false)

 const refreshPresets=useCallback(async()=>{
  try{setPresets(await window.toolDock.renamePresets.list())}
  catch(e){msg.error(e)}
 },[])

 useEffect(()=>{
  void refreshPresets()
  void window.toolDock.batchRename.canUndo().then(setCanUndo).catch(()=>{})
 },[refreshPresets])

 const sortedEntries=useMemo(()=>sortRenameEntries(entries,sortBy,sortDir),[entries,sortBy,sortDir])
 const preview=useMemo(()=>previewBatchRename(sortedEntries,checkedIds,steps,extensionPolicy),[sortedEntries,checkedIds,steps,extensionPolicy])

 const visibleRows=useMemo(()=>{
  const q=filterQuery.trim().toLowerCase()
  if(!q)return preview.rows
  return preview.rows.filter(r=>r.entry.name.toLowerCase().includes(q)||r.targetName.toLowerCase().includes(q)||r.entry.parentName.toLowerCase().includes(q))
 },[preview.rows,filterQuery])

 const appendSources=useCallback(async(paths:string[],subdirOverride?:boolean)=>{
  if(!paths.length)return
  setBusy(true)
  try{
   const res=await window.toolDock.batchRename.inspectSources(paths,subdirOverride??includeSubdirs)
   if(res.entries.length){
    let added=0
    setEntries(prev=>{
     const existing=new Set(prev.map(x=>x.path.toLowerCase()))
     const fresh=res.entries.filter(x=>!existing.has(x.path.toLowerCase()))
     added=fresh.length
     if(!fresh.length)return prev
     const merged=[...prev,...fresh].slice(0,MAX_RENAME_FILES)
     setCheckedIds(c=>{
      const next=new Set(c)
      for(const item of fresh)next.add(item.id)
      return next
     })
     return merged
    })
    if(added>0)msg.success(`已导入 ${added} 个文件`)
    else msg.info('所选文件已在队列中')
   }else if(res.skipped.length){
    msg.warning(`未导入可用文件：${res.skipped[0].reason}`)
   }
   if(res.truncated)msg.warning(`单批最多处理 ${MAX_RENAME_FILES} 个文件，超出部分已忽略`)
  }catch(e){
   msg.error(e)
  }finally{
   setBusy(false)
  }
 },[includeSubdirs])

 const dropOver=useWindowFileDrop(files=>{
  if(busy){msg.warning('正在操作中，请稍候');return}
  const paths=files.map(f=>window.toolDock.batchRename.pathForDroppedFile(f)).filter(Boolean)
  if(!paths.length){msg.warning('未能解析拖入项目的本地路径');return}
  void appendSources(paths)
 },true)

 const chooseFiles=async()=>{
  try{
   const paths=await window.toolDock.batchRename.chooseFiles()
   if(paths.length)await appendSources(paths)
  }catch(e){msg.error(e)}
 }

 const chooseFolder=async()=>{
  try{
   const folder=await window.toolDock.batchRename.chooseFolder()
   if(folder)await appendSources([folder])
  }catch(e){msg.error(e)}
 }

 const toggleRow=(id:string)=>{
  setCheckedIds(prev=>{
   const next=new Set(prev)
   if(next.has(id))next.delete(id)
   else next.add(id)
   return next
  })
 }

 const selectAll=(select:boolean)=>{
  setCheckedIds(select?new Set(entries.map(x=>x.id)):new Set())
 }

 const invertSelection=()=>{
  setCheckedIds(prev=>{
   const next=new Set<string>()
   for(const e of entries)if(!prev.has(e.id))next.add(e.id)
   return next
  })
 }

 const moveEntry=(id:string,dir:-1|1)=>{
  const list=sortBy==='manual'?entries:sortedEntries
  const idx=list.findIndex(x=>x.id===id)
  const target=idx+dir
  if(idx<0||target<0||target>=list.length)return
  setSortBy('manual')
  setEntries(arrayMove(list,idx,target))
 }

 const removeEntry=(id:string)=>{
  setEntries(prev=>prev.filter(x=>x.id!==id))
  setCheckedIds(prev=>{const next=new Set(prev);next.delete(id);return next})
 }

 const clearEntries=()=>{
  setEntries([])
  setCheckedIds(new Set())
 }

 const addStep=(kind:RenameStepKind)=>{
  if(steps.length>=MAX_RENAME_STEPS){msg.warning(`最多添加 ${MAX_RENAME_STEPS} 个规则步骤`);return}
  setSteps(prev=>[...prev,makeRenameStep(kind)])
 }

 const reorderSteps=({active,over}:DragEndEvent)=>{
  if(!over||over.id===active.id)return
  const a=steps.findIndex(x=>x.id===active.id),b=steps.findIndex(x=>x.id===over.id)
  if(a>=0&&b>=0)setSteps(arrayMove(steps,a,b))
 }

 const executeRename=async()=>{
  if(!preview.canExecute)return
  const changedRows=preview.rows.filter(r=>r.checked&&r.changed&&r.status==='ready')
  if(!changedRows.length)return
  const ok=await dialog.confirm({
   title:'确认原地批量重命名',
   description:`即将直接修改磁盘上 ${changedRows.length} 个文件的文件名。若需恢复可在完成后点击「撤销上次重命名」。`,
   variant:'warning',
   confirmText:'确认重命名'
  })
  if(!ok)return
  setBusy(true)
  try{
   const report=await window.toolDock.batchRename.execute(
    changedRows.map(r=>({sourcePath:r.entry.path,targetName:r.targetName}))
   )
   const previousMap=new Map(changedRows.map(r=>[r.entry.id,{path:r.entry.path,name:r.entry.name,stem:r.entry.stem,ext:r.entry.ext}]))
   const renamedMap=new Map(changedRows.map(r=>[r.entry.id,r.targetName]))
   setEntries(prev=>prev.map(item=>{
    const nextName=renamedMap.get(item.id)
    if(!nextName)return item
    const {stem,ext}=splitLocalName(nextName)
    return {...item,name:nextName,stem,ext,path:joinPath(item.dir,nextName)}
   }))
   setUndoRestoreMap(previousMap)
   setCanUndo(report.canUndo)
   msg.success(`已完成 ${report.renamedCount} 个文件的重命名`)
  }catch(e){
   msg.error(e)
  }finally{
   setBusy(false)
  }
 }

 const undoLastRename=async()=>{
  if(!canUndo)return
  const ok=await dialog.confirm({
   title:'撤销上次批量重命名',
   description:'将把上一批重命名的文件按原名称还原，请确保这些文件未被外部移动或删除。',
   variant:'warning',
   confirmText:'确认撤销'
  })
  if(!ok)return
  setBusy(true)
  try{
   const report=await window.toolDock.batchRename.undo()
   setCanUndo(report.canUndo)
   if(undoRestoreMap){
    setEntries(prev=>prev.map(item=>{
     const restored=undoRestoreMap.get(item.id)
     return restored?{...item,...restored}:item
    }))
    setUndoRestoreMap(null)
   }
   msg.success(`已还原 ${report.renamedCount} 个文件`)
  }catch(e){
   msg.error(e)
  }finally{
   setBusy(false)
  }
 }

 const savePreset=async(asNew:boolean)=>{
  try{
   const valid=renamePresetInputSchema.parse({
    name:draftName,
    description:draftDescription,
    steps,
    extensionPolicy
   })
   const saved=!asNew&&currentPreset
    ?await window.toolDock.renamePresets.update(currentPreset.id,currentPreset.revision,valid)
    :await window.toolDock.renamePresets.create(valid)
   setCurrentPreset(saved)
   setDraftName(saved.name)
   setDraftDescription(saved.description)
   await refreshPresets()
   msg.success('重命名预设已保存')
  }catch(e){msg.error(e)}
 }

 const loadPreset=async(id:string)=>{
  try{
   const item=await window.toolDock.renamePresets.get(id)
   setCurrentPreset(item)
   setDraftName(item.name)
   setDraftDescription(item.description)
   setSteps(item.steps)
   setExtensionPolicy(item.extensionPolicy)
   setPresetDialogOpen(false)
   msg.success(`已载入预设「${item.name}」`)
  }catch(e){msg.error(e)}
 }

 const duplicatePreset=async(item:RenamePresetSummary)=>{
  try{await window.toolDock.renamePresets.duplicate(item.id);await refreshPresets();msg.success('预设已复制')}
  catch(e){msg.error(e)}
 }

 const removePreset=async(item:RenamePresetSummary)=>{
  const yes=await dialog.confirm({title:'删除预设？',description:`将永久删除「${item.name}」，此操作不可撤销。`,variant:'danger',confirmText:'删除'})
  if(!yes)return
  try{
   await window.toolDock.renamePresets.remove(item.id,item.revision)
   if(currentPreset?.id===item.id){setCurrentPreset(null);setDraftName('');setDraftDescription('')}
   await refreshPresets()
  }catch(e){msg.error(e)}
 }

 return (
  <div className="relative @container mx-auto max-w-[1620px] space-y-4 p-5">
   <header className="flex flex-wrap items-center gap-3">
    <div className="rounded-xl bg-indigo-500/15 p-3 text-indigo-400"><ToolPageIcon size={22}/></div>
    <div className="min-w-0 flex-1">
     <h1 className="text-xl font-semibold">批量重命名</h1>
     <p className="mt-1 text-xs muted">多步骤规则流水线、模板序号、正则替换与原地两阶段防冲突重命名 · 完全本地</p>
    </div>
    <Button disabled={!canUndo||busy} onClick={()=>void undoLastRename()}><RotateCcw size={15}/> 撤销上次重命名</Button>
    <Button onClick={()=>setPresetDialogOpen(true)}><FolderOpen size={15}/> 预设库</Button>
   </header>

   <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
    <Button size="sm" variant="primary" disabled={busy} onClick={()=>void chooseFiles()}><Plus size={14}/> 添加文件</Button>
    <Button size="sm" disabled={busy} onClick={()=>void chooseFolder()}><FolderPlus size={14}/> 添加文件夹</Button>
    <label className="ml-1 flex items-center gap-2 text-xs muted">
     <SwitchField ariaLabel="扫描包含子目录" checked={includeSubdirs} onCheckedChange={setIncludeSubdirs}/> 包含子目录
    </label>
    <Button size="sm" variant="ghost" disabled={!entries.length||busy} onClick={clearEntries}><Trash2 size={14}/> 清空列表</Button>
    <div className="ml-auto flex flex-wrap items-center gap-3 text-xs muted">
     <span>已加载 {preview.stats.total} / {MAX_RENAME_FILES}</span>
     <span>已选 {preview.stats.checked}</span>
     <span className="text-[var(--primary)]">待改名 {preview.stats.changed}</span>
     {(preview.stats.conflicts>0||preview.stats.invalid>0)&&(
      <span className="text-red-400">异常 {preview.stats.conflicts+preview.stats.invalid}</span>
     )}
    </div>
   </div>

   <div className="grid gap-4 @min-[960px]:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.85fr)]">
    <section className={CARD+' min-w-0 space-y-3'}>
     <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[170px] flex-1">
       <Search size={14} className="pointer-events-none absolute left-3 top-2.5 muted"/>
       <Input aria-label="过滤文件列表" placeholder="过滤文件名或父目录..." value={filterQuery} onChange={e=>setFilterQuery(e.target.value)} className="h-8 pl-8 text-xs"/>
      </div>
      <SelectField
       ariaLabel="列表排序方式"
       value={sortBy}
       onValueChange={v=>setSortBy(v as RenameSortBy)}
       options={[
        {value:'name',label:'按文件名（自然排序）'},
        {value:'mtime',label:'按修改时间'},
        {value:'size',label:'按文件大小'},
        {value:'ext',label:'按扩展名'},
        {value:'manual',label:'手动顺序'}
       ]}
       className="h-8 min-w-[160px] text-xs"
      />
      <Button size="sm" variant="ghost" disabled={sortBy==='manual'} onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} title="切换升序/降序">
       <ArrowUpDown size={13}/> {sortDir==='asc'?'升序':'降序'}
      </Button>
     </div>

     <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2 text-xs">
      <Button size="sm" variant="ghost" disabled={!entries.length} onClick={()=>selectAll(true)}><CheckSquare size={13}/> 全选</Button>
      <Button size="sm" variant="ghost" disabled={!entries.length} onClick={invertSelection}>反选</Button>
      <Button size="sm" variant="ghost" disabled={!entries.length} onClick={()=>selectAll(false)}><Square size={13}/> 全不选</Button>
     </div>

     <div className="max-h-[540px] space-y-1.5 overflow-y-auto pr-1">
      {visibleRows.length?visibleRows.map(row=>{
       const bad=row.status==='conflict'||row.status==='invalid'
       return (
        <div
         key={row.entry.id}
         className={'flex items-center gap-2.5 rounded-xl border p-2.5 text-xs '+(bad?'border-red-500/45 bg-red-500/5':'border-[var(--border)] bg-[var(--panel-alt)]')}
        >
         <input
          type="checkbox"
          aria-label={'选择 '+row.entry.name}
          checked={row.checked}
          onChange={()=>toggleRow(row.entry.id)}
          className="h-4 w-4 shrink-0 accent-[var(--primary)]"
         />
         <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
           <span className="max-w-full truncate muted" title={row.entry.path}>{row.entry.name}</span>
           <span className="muted">→</span>
           <span
            className={'max-w-full truncate font-medium '+(bad?'text-red-400':row.changed?'text-[var(--primary)]':'muted')}
            title={row.targetName}
           >
            {row.targetName}
           </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] muted">
           <span>目录：{row.entry.parentName}</span>
           {row.status==='ready'&&<span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] text-[var(--primary)]">将修改</span>}
           {bad&&<span className="flex items-center gap-1 text-red-400"><AlertTriangle size={12}/> {row.message}</span>}
          </div>
         </div>
         <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" title="上移" onClick={()=>moveEntry(row.entry.id,-1)}><ArrowUp size={13}/></Button>
          <Button variant="ghost" size="icon" title="下移" onClick={()=>moveEntry(row.entry.id,1)}><ArrowDown size={13}/></Button>
          <Button variant="ghost" size="icon" title="移除" onClick={()=>removeEntry(row.entry.id)}><Trash2 size={13}/></Button>
         </div>
        </div>
       )
      }):(
       <div className="py-16 text-center text-xs muted">
        {entries.length?'当前搜索条件下没有匹配文件':'拖入文件或文件夹到窗口，或点击上方「添加文件 / 添加文件夹」开始'}
       </div>
      )}
     </div>
    </section>

    <section className={CARD+' min-w-0 space-y-4'}>
     <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">重命名规则流水线 <span className="text-xs font-normal muted">{steps.length} / {MAX_RENAME_STEPS}</span></h2>
      <div className="flex flex-wrap gap-1.5">
       <Button size="sm" onClick={()=>addStep('template')}><Plus size={13}/> 序号模板</Button>
       <Button size="sm" onClick={()=>addStep('replace')}><Plus size={13}/> 查找替换</Button>
       <Button size="sm" onClick={()=>addStep('affix-trim')}><Plus size={13}/> 前后缀</Button>
       <Button size="sm" onClick={()=>addStep('normalize')}><Plus size={13}/> 清洗</Button>
      </div>
     </div>

     <DndContext collisionDetection={closestCenter} onDragEnd={reorderSteps}>
      <SortableContext items={steps.map(s=>s.id)} strategy={verticalListSortingStrategy}>
       <div className="max-h-[380px] space-y-2.5 overflow-y-auto pr-1">
        {steps.map((step,idx)=>(
         <RenameStepCard
          key={step.id}
          step={step}
          index={idx}
          total={steps.length}
          error={preview.stepErrors[step.id]}
          onChange={next=>setSteps(prev=>prev.map(x=>x.id===next.id?next:x))}
          onMove={dir=>{
           const target=idx+dir
           if(target>=0&&target<steps.length)setSteps(prev=>arrayMove(prev,idx,target))
          }}
          onDuplicate={()=>{
           if(steps.length>=MAX_RENAME_STEPS){msg.warning(`最多添加 ${MAX_RENAME_STEPS} 个规则步骤`);return}
           const copy:RenameStep={...step,id:crypto.randomUUID(),options:{...step.options}}
           setSteps(prev=>[...prev.slice(0,idx+1),copy,...prev.slice(idx+1)])
          }}
          onRemove={()=>setSteps(prev=>prev.filter(x=>x.id!==step.id))}
         />
        ))}
        {!steps.length&&<p className="rounded-xl border border-dashed border-[var(--border)] py-6 text-center text-xs muted">请点击上方按钮添加至少一条重命名规则</p>}
       </div>
      </SortableContext>
     </DndContext>

     <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--panel-alt)]/55 p-3">
      <div className="text-xs font-medium">扩展名处理（独立作用于后缀）</div>
      <div className="grid gap-2 sm:grid-cols-2">
       <SelectField
        ariaLabel="扩展名策略"
        value={extensionPolicy.mode}
        onValueChange={v=>setExtensionPolicy(prev=>({...prev,mode:v as ExtensionMode}))}
        options={[
         {value:'keep',label:'保持原扩展名（默认）'},
         {value:'lower',label:'统一小写（如 .JPG → .jpg）'},
         {value:'upper',label:'统一大写'},
         {value:'custom',label:'替换为自定义扩展名'}
        ]}
        className="h-9 w-full text-xs"
       />
       {extensionPolicy.mode==='custom'&&(
        <Input
         aria-label="自定义扩展名"
         placeholder="例如 png 或 .png（留空清除后缀）"
         value={extensionPolicy.customExt}
         onChange={e=>setExtensionPolicy(prev=>({...prev,customExt:e.target.value}))}
         className="h-9 text-xs font-mono"
        />
       )}
      </div>
     </div>

     <div className="space-y-2 border-t border-[var(--border)] pt-3">
      {(preview.stats.conflicts>0||preview.stats.invalid>0)&&(
       <p role="alert" className="text-xs text-red-400">存在 {preview.stats.conflicts} 处重名冲突、{preview.stats.invalid} 处非法文件名，请修正后再执行</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
       <Button variant="primary" disabled={!preview.canExecute||busy} onClick={()=>void executeRename()}>
        执行重命名（{preview.stats.changed} 个）
       </Button>
       <Button variant="ghost" onClick={()=>setSteps([makeRenameStep('template')])}>重置规则</Button>
      </div>
     </div>
    </section>
   </div>

   <RenamePresetDialog
    open={presetDialogOpen}
    onClose={()=>setPresetDialogOpen(false)}
    presets={presets}
    currentPreset={currentPreset}
    draftName={draftName}
    draftDescription={draftDescription}
    onDraftMetaChange={(name,desc)=>{setDraftName(name);setDraftDescription(desc)}}
    onSave={savePreset}
    onLoad={loadPreset}
    onDuplicate={duplicatePreset}
    onRemove={removePreset}
    onRefresh={refreshPresets}
   />
   <DropOverlay visible={dropOver}/>
  </div>
 )
}
