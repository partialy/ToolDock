import { useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle,
  ArrowUpToLine,
  CheckCircle2,
  Copy,
  FolderOpen,
  GripVertical,
  Plus,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SelectField } from '@/components/ui/select-field'
import { useDialog } from '@/components/ui/dialog-provider'
import { msg } from '@/components/ui/message'
import {
  deduplicatePathEntries,
  hasSystem32InPath,
  joinPathEntries,
  normalizeWinPathForCompare,
  splitPathEntries,
  type EnvScope,
  type WhereIsResult
} from '@/shared/envManagerModels'
import type { MergedEnvItem } from './EnvVariablesView'

interface Props {
  scope: EnvScope
  onScopeChange: (scope: EnvScope) => void
  allItems: MergedEnvItem[]
  pathDirectoriesExist: Record<string, boolean>
  disabled: boolean
  onStagePathChange: (scope: EnvScope, nextRawPath: string) => void
}

type PathRowItem = {
  id: string
  index: number
  raw: string
  expanded: string
  exists: boolean | null
  duplicateInScope: boolean
  duplicateCrossScope: boolean
}

function expandPathClient(raw: string, allItems: MergedEnvItem[]): string {
  const map = new Map<string, string>()
  for (const item of allItems) {
    if (item.status === 'deleted') continue
    if (item.scope === 'Machine') map.set(item.name.toLowerCase(), item.expandedValue || item.rawValue)
  }
  for (const item of allItems) {
    if (item.status === 'deleted') continue
    if (item.scope === 'User') map.set(item.name.toLowerCase(), item.expandedValue || item.rawValue)
  }
  return raw.replace(/%([^%]+)%/g, (full, name: string) => {
    const found = map.get(name.toLowerCase())
    return found !== undefined ? found : full
  })
}

function SortablePathRow({
  row,
  disabled,
  onMoveTop,
  onOpenFolder,
  onCopy,
  onRemove
}: {
  row: PathRowItem
  disabled: boolean
  onMoveTop: () => void
  onOpenFolder: () => void
  onCopy: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition-colors ' +
        (isDragging
          ? 'border-[var(--primary)] bg-[var(--selected)] shadow-lg'
          : row.exists === false
            ? 'border-red-500/30 bg-red-500/5'
            : row.duplicateInScope
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-[var(--border)] bg-[var(--panel-alt)] hover:border-[var(--primary)]/30')
      }
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="cursor-grab touch-none p-1 muted hover:text-[var(--foreground)] active:cursor-grabbing disabled:cursor-not-allowed"
        aria-label="拖拽调整顺序"
      >
        <GripVertical size={15} />
      </button>

      <span className="w-7 shrink-0 font-mono text-[11px] muted">#{row.index + 1}</span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-medium text-[var(--foreground)] break-all">{row.raw}</span>
          {row.exists === false && (
            <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-400">
              <AlertTriangle size={11} /> 目录不存在
            </span>
          )}
          {row.exists === true && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
              <CheckCircle2 size={11} /> 有效
            </span>
          )}
          {row.duplicateInScope && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-400">
              同级重复
            </span>
          )}
          {!row.duplicateInScope && row.duplicateCrossScope && (
            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-400">
              用户/系统均含
            </span>
          )}
        </div>
        {row.raw !== row.expanded && (
          <div className="mt-0.5 font-mono text-[11px] muted break-all">展开: {row.expanded}</div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {row.index > 0 && (
          <Button
            type="button"
            className="h-7 px-2"
            disabled={disabled}
            onClick={onMoveTop}
            title="置顶到最高优先级"
          >
            <ArrowUpToLine size={13} />
          </Button>
        )}
        <Button
          type="button"
          className="h-7 px-2"
          disabled={row.exists === false}
          onClick={onOpenFolder}
          title="在资源管理器中打开目录"
        >
          <FolderOpen size={13} />
        </Button>
        <Button type="button" className="h-7 px-2" onClick={onCopy} title="复制路径">
          <Copy size={13} />
        </Button>
        <Button
          type="button"
          className="h-7 px-2 text-red-400 hover:text-red-300"
          disabled={disabled}
          onClick={onRemove}
          title="移除此条目"
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  )
}

const COMMON_COMMANDS = ['java', 'node', 'python', 'git', 'mvn', 'go', 'cargo', 'ffmpeg']

export function EnvPathView({
  scope,
  onScopeChange,
  allItems,
  pathDirectoriesExist,
  disabled,
  onStagePathChange
}: Props) {
  const dialog = useDialog()
  const [newEntryText, setNewEntryText] = useState('')
  const [filterText, setFilterText] = useState('')

  const [whereQuery, setWhereQuery] = useState('node')
  const [whereResult, setWhereResult] = useState<WhereIsResult | null>(null)
  const [whereBusy, setWhereBusy] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const currentPathEntry = useMemo(
    () => allItems.find(i => i.scope === scope && i.name.toLowerCase() === 'path' && i.status !== 'deleted'),
    [allItems, scope]
  )
  const otherScope: EnvScope = scope === 'User' ? 'Machine' : 'User'
  const otherPathEntry = useMemo(
    () => allItems.find(i => i.scope === otherScope && i.name.toLowerCase() === 'path' && i.status !== 'deleted'),
    [allItems, otherScope]
  )

  const rawEntries = useMemo(
    () => splitPathEntries(currentPathEntry?.rawValue || ''),
    [currentPathEntry?.rawValue]
  )

  const rows: PathRowItem[] = useMemo(() => {
    const otherNormSet = new Set(
      splitPathEntries(otherPathEntry?.rawValue || '').map(normalizeWinPathForCompare)
    )
    const seenInScope = new Set<string>()

    return rawEntries.map((raw, index) => {
      const expanded = expandPathClient(raw, allItems).replace(/^"+|"+$/g, '').trim()
      const norm = normalizeWinPathForCompare(raw)
      const duplicateInScope = seenInScope.has(norm)
      seenInScope.add(norm)
      const duplicateCrossScope = otherNormSet.has(norm)
      const exists = expanded in pathDirectoriesExist ? pathDirectoriesExist[expanded] : null
      return {
        id: `${index}::${raw}`,
        index,
        raw,
        expanded,
        exists,
        duplicateInScope,
        duplicateCrossScope
      }
    })
  }, [rawEntries, otherPathEntry?.rawValue, allItems, pathDirectoriesExist])

  const filteredRows = useMemo(() => {
    const q = filterText.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.raw.toLowerCase().includes(q) || r.expanded.toLowerCase().includes(q))
  }, [rows, filterText])

  const missingCount = useMemo(() => rows.filter(r => r.exists === false).length, [rows])
  const dupCount = useMemo(() => rows.filter(r => r.duplicateInScope).length, [rows])

  const commitEntries = (nextList: string[]) => {
    const joined = joinPathEntries(nextList)
    if (scope === 'Machine' && !hasSystem32InPath(joined)) {
      msg.error('系统级 Path 必须保留 %SystemRoot%\\system32（或 C:\\Windows\\System32）')
      return
    }
    onStagePathChange(scope, joined)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = rows.findIndex(r => r.id === active.id)
    const newIndex = rows.findIndex(r => r.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    commitEntries(arrayMove(rawEntries, oldIndex, newIndex))
  }

  const addEntry = (text: string) => {
    const parts = splitPathEntries(text)
    if (parts.length === 0) return
    commitEntries([...rawEntries, ...parts])
    setNewEntryText('')
  }

  const pickDirectoryToAdd = async () => {
    try {
      const dir = await window.toolDock.commands.chooseDirectory()
      if (dir) addEntry(dir)
    } catch (e) {
      msg.error(e)
    }
  }

  const handleDeduplicate = () => {
    const { result, removedCount } = deduplicatePathEntries(rawEntries)
    if (removedCount === 0) {
      msg.info('当前作用域 Path 没有重复项')
      return
    }
    commitEntries(result)
    msg.success(`已清理 ${removedCount} 条重复 Path 项（已暂存）`)
  }

  const handleRemoveMissing = async () => {
    if (missingCount === 0) return
    const confirmed = await dialog.confirm({
      title: '清理失效的 Path 目录？',
      variant: 'warning',
      confirmText: '清理失效项',
      description: `将在当前 ${scope === 'Machine' ? '系统' : '用户'} Path 中移除 ${missingCount} 条本地不存在的目录路径（写入注册表前仍可在顶部撤销）。`
    })
    if (!confirmed) return
    const next = rows.filter(r => r.exists !== false).map(r => r.raw)
    commitEntries(next)
    msg.success(`已移除 ${missingCount} 条失效目录（已暂存）`)
  }

  const runWhereIs = async (customCmd?: string) => {
    const target = (customCmd ?? whereQuery).trim()
    if (!target || whereBusy) return
    if (customCmd) setWhereQuery(customCmd)
    setWhereBusy(true)
    try {
      const res = await window.toolDock.envManager.whereIs(target)
      setWhereResult(res)
    } catch (e) {
      msg.error(e)
    } finally {
      setWhereBusy(false)
    }
  }

  const openFolderSafe = async (dirPath: string) => {
    try {
      await window.toolDock.commands.openFolder(dirPath)
    } catch (e) {
      msg.error(e)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* 左侧：Path 分条拖拽与巡检 */}
      <div className="space-y-4 xl:col-span-7">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <SelectField
                ariaLabel="选择 Path 作用域"
                value={scope}
                onValueChange={v => onScopeChange(v as EnvScope)}
                options={[
                  { value: 'User', label: '用户 Path (HKCU)' },
                  { value: 'Machine', label: '系统 Path (HKLM)' }
                ]}
                className="w-[175px]"
              />
              <Input
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                placeholder="筛选当前 Path 条目…"
                className="w-[190px]"
                aria-label="筛选 Path 条目"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={disabled || dupCount === 0}
                onClick={handleDeduplicate}
                title="保留靠前项并移除重复目录"
              >
                <Sparkles size={14} /> 一键去重 ({dupCount})
              </Button>
              <Button
                type="button"
                disabled={disabled || missingCount === 0}
                onClick={() => void handleRemoveMissing()}
                title="移除本地磁盘上不存在的失效目录"
              >
                <Trash2 size={14} /> 清理失效项 ({missingCount})
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={newEntryText}
              disabled={disabled}
              onChange={e => setNewEntryText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addEntry(newEntryText)
              }}
              placeholder="输入新路径（支持 %JAVA_HOME%\bin 等引用）后回车添加"
              spellCheck={false}
              className="font-mono"
              aria-label="新 Path 路径"
            />
            <Button type="button" disabled={disabled} onClick={() => void pickDirectoryToAdd()}>
              <FolderOpen size={15} /> 浏览添加
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={disabled || !newEntryText.trim()}
              onClick={() => addEntry(newEntryText)}
            >
              <Plus size={15} /> 添加
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
          <div className="mb-3 flex items-center justify-between text-xs muted">
            <span>
              共 {rows.length} 条路径 · 越靠前优先级越高（拖拽手柄可调整优先级顺序）
            </span>
            {filterText.trim() && <span>筛选期间暂停拖拽排序</span>}
          </div>

          {filteredRows.length === 0 ? (
            <div className="p-8 text-center text-xs muted">没有匹配的 Path 路径条目</div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={filteredRows.map(r => r.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                  {filteredRows.map(row => (
                    <SortablePathRow
                      key={row.id}
                      row={row}
                      disabled={disabled || Boolean(filterText.trim())}
                      onMoveTop={() => {
                        const next = [...rawEntries]
                        const [picked] = next.splice(row.index, 1)
                        next.unshift(picked)
                        commitEntries(next)
                      }}
                      onOpenFolder={() => void openFolderSafe(row.expanded)}
                      onCopy={() => {
                        void navigator.clipboard.writeText(row.raw).then(() => msg.success('已复制路径'))
                      }}
                      onRemove={() => {
                        const next = rawEntries.filter((_, idx) => idx !== row.index)
                        commitEntries(next)
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* 右侧：Where-is 命令行冲突定位器 */}
      <div className="space-y-4 xl:col-span-5">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">命令行冲突探测 (Where-is)</h3>
            <p className="mt-0.5 text-xs muted">
              按 Windows 生效顺序（系统 Path → 用户 Path + PATHEXT）扫描可执行文件，定位为什么终端调到了旧版本。
            </p>
          </div>

          <div className="flex gap-2">
            <Input
              value={whereQuery}
              onChange={e => setWhereQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void runWhereIs()
              }}
              placeholder="输入命令名，例如 node、java、python、git"
              spellCheck={false}
              className="font-mono"
              aria-label="探测命令名"
            />
            <Button
              variant="primary"
              type="button"
              disabled={whereBusy || !whereQuery.trim()}
              onClick={() => void runWhereIs()}
            >
              <Search size={15} /> {whereBusy ? '扫描中…' : '探测'}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] muted">常用探测：</span>
            {COMMON_COMMANDS.map(cmd => (
              <button
                key={cmd}
                type="button"
                onClick={() => void runWhereIs(cmd)}
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-alt)] px-2 py-0.5 font-mono text-[11px] hover:border-[var(--primary)]/40 hover:text-[var(--primary)]"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
          {!whereResult ? (
            <div className="p-8 text-center text-xs muted">
              输入命令名称并点击「探测」，查看当前生效的可执行文件及被遮蔽的低优先级版本
            </div>
          ) : whereResult.hits.length === 0 ? (
            <div className="p-8 text-center text-xs text-amber-400">
              未在当前生效的 Path 目录中找到命令 <span className="font-mono font-semibold">{whereResult.query}</span>（耗时 {whereResult.durationMs} ms）
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs muted">
                <span>
                  命令 <strong className="font-mono text-[var(--foreground)]">{whereResult.query}</strong> 共命中 {whereResult.hits.length} 个可执行文件
                </span>
                <span>耗时 {whereResult.durationMs} ms</span>
              </div>

              {whereResult.hits.map(hit => (
                <div
                  key={hit.fullPath}
                  className={
                    'rounded-xl border p-3 text-xs space-y-1.5 ' +
                    (hit.active
                      ? 'border-emerald-500/35 bg-emerald-500/5'
                      : 'border-[var(--border)] bg-[var(--panel-alt)] opacity-80')
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          'rounded px-1.5 py-0.5 text-[10px] font-semibold ' +
                          (hit.active
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-zinc-500/20 muted')
                        }
                      >
                        {hit.active ? '#1 当前生效' : `#${hit.rank} 被遮蔽 (Shadowed)`}
                      </span>
                      <span className="rounded bg-[var(--panel)] px-1.5 py-0.5 text-[10px] muted">
                        来自{hit.scope === 'Machine' ? '系统 Path' : '用户 Path'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => void openFolderSafe(hit.directory)}
                        title="打开所在目录"
                      >
                        <FolderOpen size={12} /> 目录
                      </Button>
                      <Button
                        type="button"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          void navigator.clipboard.writeText(hit.fullPath).then(() => msg.success('已复制完整路径'))
                        }}
                        title="复制完整路径"
                      >
                        <Copy size={12} />
                      </Button>
                    </div>
                  </div>

                  <div className="font-mono text-xs text-[var(--foreground)] break-all">
                    {hit.fullPath}
                  </div>
                  <div className="text-[11px] muted">
                    大小：{(hit.sizeBytes / 1024).toFixed(1)} KB · 修改时间：{new Date(hit.modifiedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
