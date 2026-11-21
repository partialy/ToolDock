import { useMemo, useState } from 'react'
import {
  Download,
  Eye,
  History,
  Plus,
  RotateCcw,
  Trash2,
  Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDialog } from '@/components/ui/dialog-provider'
import { msg } from '@/components/ui/message'
import {
  isSensitiveVarName,
  type EnvEntry,
  type EnvSnapshotDetail,
  type EnvSnapshotSummary
} from '@/shared/envManagerModels'

interface Props {
  snapshots: EnvSnapshotSummary[]
  userEntries: EnvEntry[]
  machineEntries: EnvEntry[]
  disabled: boolean
  onCreateSnapshot: (title: string) => Promise<void>
  onRemoveSnapshot: (id: string) => Promise<void>
  onRestoreSnapshot: (id: string) => Promise<void>
  onExportSnapshot: (id?: string) => Promise<void>
  onImportSnapshot: () => Promise<void>
}

export function EnvSnapshotsView({
  snapshots,
  userEntries,
  machineEntries,
  disabled,
  onCreateSnapshot,
  onRemoveSnapshot,
  onRestoreSnapshot,
  onExportSnapshot,
  onImportSnapshot
}: Props) {
  const dialog = useDialog()
  const [titleInput, setTitleInput] = useState('')
  const [selectedDetail, setSelectedDetail] = useState<EnvSnapshotDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const handleCreate = async () => {
    await onCreateSnapshot(titleInput.trim() || '手动备份快照')
    setTitleInput('')
  }

  const handleInspect = async (id: string) => {
    setLoadingDetail(true)
    try {
      const detail = await window.toolDock.envManager.getSnapshot(id)
      setSelectedDetail(detail)
    } catch (e) {
      msg.error(e)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleConfirmRestore = async (item: EnvSnapshotSummary) => {
    const yes = await dialog.confirm({
      title: '回滚环境变量到此快照？',
      variant: 'warning',
      confirmText: '确认回滚',
      description: `快照名称：${item.title}\n创建时间：${new Date(item.createdAt).toLocaleString()}\n回滚前会自动为您当前的环境变量生成一份新的保护快照。若涉及系统级变量变更，可能会请求 UAC 管理员授权。`
    })
    if (!yes) return
    await onRestoreSnapshot(item.id)
  }

  const handleConfirmDelete = async (item: EnvSnapshotSummary) => {
    const yes = await dialog.confirm({
      title: '删除此快照记录？',
      variant: 'danger',
      confirmText: '删除快照',
      description: `将删除快照「${item.title}」，删除后不可恢复。`
    })
    if (!yes) return
    if (selectedDetail?.id === item.id) setSelectedDetail(null)
    await onRemoveSnapshot(item.id)
  }

  const diffRows = useMemo(() => {
    if (!selectedDetail) return []
    const currentAll = [...userEntries, ...machineEntries]
    const currentMap = new Map<string, EnvEntry>()
    for (const e of currentAll) {
      currentMap.set(`${e.scope}:${e.name.toLowerCase()}`, e)
    }

    const snapMap = new Map<string, EnvSnapshotDetail['items'][number]>()
    for (const s of selectedDetail.items) {
      snapMap.set(`${s.scope}:${s.name.toLowerCase()}`, s)
    }

    const diffs: {
      key: string
      scope: 'User' | 'Machine'
      name: string
      kind: 'restore-set' | 'restore-add' | 'restore-delete'
      snapVal: string
      currVal: string
    }[] = []

    for (const [k, snapItem] of snapMap.entries()) {
      const curr = currentMap.get(k)
      if (!curr) {
        diffs.push({
          key: k,
          scope: snapItem.scope,
          name: snapItem.name,
          kind: 'restore-add',
          snapVal: snapItem.rawValue,
          currVal: ''
        })
      } else if (curr.rawValue !== snapItem.rawValue) {
        diffs.push({
          key: k,
          scope: snapItem.scope,
          name: snapItem.name,
          kind: 'restore-set',
          snapVal: snapItem.rawValue,
          currVal: curr.rawValue
        })
      }
    }

    for (const [k, curr] of currentMap.entries()) {
      if (!snapMap.has(k)) {
        diffs.push({
          key: k,
          scope: curr.scope,
          name: curr.name,
          kind: 'restore-delete',
          snapVal: '',
          currVal: curr.rawValue
        })
      }
    }

    return diffs
  }, [selectedDetail, userEntries, machineEntries])

  const maskIfNeeded = (name: string, val: string) =>
    isSensitiveVarName(name) && val ? '••••••••••••' : val

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* 左侧：快照列表与新建/导入导出 */}
      <div className="space-y-4 xl:col-span-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">快照备份与一键回滚</h3>
              <p className="mt-0.5 text-xs muted">
                每次修改环境变量或切换版本前均会自动生成快照（自动快照保留最近 30 份）。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" disabled={disabled} onClick={() => void onImportSnapshot()}>
                <Upload size={14} /> 导入 JSON
              </Button>
              <Button type="button" disabled={disabled} onClick={() => void onExportSnapshot()}>
                <Download size={14} /> 导出当前环境
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              value={titleInput}
              disabled={disabled}
              onChange={e => setTitleInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void handleCreate()
              }}
              placeholder="输入手动快照备注（如：配置 Android SDK 前）"
              aria-label="手动快照备注"
            />
            <Button variant="primary" type="button" disabled={disabled} onClick={() => void handleCreate()}>
              <Plus size={15} /> 创建快照
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
          {snapshots.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <History size={28} className="mx-auto muted" />
              <div className="text-xs muted">暂无历史快照记录</div>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
              {snapshots.map(item => {
                const selected = selectedDetail?.id === item.id
                return (
                  <div
                    key={item.id}
                    className={
                      'rounded-xl border p-3.5 text-xs transition-colors ' +
                      (selected
                        ? 'border-[var(--primary)] bg-[var(--selected)]'
                        : 'border-[var(--border)] bg-[var(--panel-alt)] hover:border-[var(--primary)]/30')
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                              (item.kind === 'manual'
                                ? 'bg-indigo-500/20 text-indigo-400'
                                : 'bg-zinc-500/20 muted')
                            }
                          >
                            {item.kind === 'manual' ? '手动快照' : '自动备份'}
                          </span>
                          <span className="font-semibold text-[var(--foreground)] break-all">
                            {item.title}
                          </span>
                        </div>
                        <div className="text-[11px] muted">
                          {new Date(item.createdAt).toLocaleString()} · 用户变量 {item.userCount} 项 / 系统变量 {item.machineCount} 项
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          className="h-7 px-2"
                          onClick={() => void handleInspect(item.id)}
                          title="对比此快照与当前系统环境变量差异"
                        >
                          <Eye size={13} /> 对比
                        </Button>
                        <Button
                          type="button"
                          className="h-7 px-2"
                          disabled={disabled}
                          onClick={() => void onExportSnapshot(item.id)}
                          title="导出此快照为 JSON"
                        >
                          <Download size={13} />
                        </Button>
                        <Button
                          variant="primary"
                          type="button"
                          className="h-7 px-2.5"
                          disabled={disabled}
                          onClick={() => void handleConfirmRestore(item)}
                          title="回滚到此快照状态"
                        >
                          <RotateCcw size={13} /> 回滚
                        </Button>
                        <Button
                          type="button"
                          className="h-7 px-2 text-red-400"
                          disabled={disabled}
                          onClick={() => void handleConfirmDelete(item)}
                          title="删除快照"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 右侧：选中快照与当前环境的 Diff 详情 */}
      <div className="space-y-4 xl:col-span-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 min-h-[320px]">
          {loadingDetail ? (
            <div className="p-12 text-center text-xs muted">正在加载快照详情…</div>
          ) : !selectedDetail ? (
            <div className="p-12 text-center text-xs muted">
              点击左侧任一快照的「对比」按钮，可查看该快照与当前系统环境变量的差异明细
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div>
                  <h4 className="text-sm font-semibold">{selectedDetail.title}</h4>
                  <p className="mt-0.5 text-xs muted">
                    与当前系统环境对比：{diffRows.length === 0 ? '完全一致，无差异' : `共 ${diffRows.length} 项差异`}
                  </p>
                </div>
                {diffRows.length > 0 && (
                  <Button
                    variant="primary"
                    type="button"
                    disabled={disabled}
                    onClick={() => void handleConfirmRestore(selectedDetail)}
                  >
                    <RotateCcw size={14} /> 回滚恢复此快照
                  </Button>
                )}
              </div>

              {diffRows.length === 0 ? (
                <div className="p-8 text-center text-xs text-emerald-400">
                  当前系统环境变量与该快照完全一致，无需回滚。
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {diffRows.map(d => (
                    <div
                      key={d.key}
                      className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[var(--panel)] px-1.5 py-0.5 text-[10px] muted">
                            {d.scope === 'Machine' ? '系统' : '用户'}
                          </span>
                          <span className="font-mono font-semibold">{d.name}</span>
                        </div>
                        <span
                          className={
                            'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                            (d.kind === 'restore-add'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : d.kind === 'restore-delete'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-amber-500/20 text-amber-400')
                          }
                        >
                          {d.kind === 'restore-add'
                            ? '回滚将恢复已删变量'
                            : d.kind === 'restore-delete'
                              ? '回滚将移除新增变量'
                              : '回滚将还原旧值'}
                        </span>
                      </div>

                      {d.currVal && (
                        <div className="rounded bg-red-500/10 px-2.5 py-1.5 font-mono text-[11px] text-red-300 break-all">
                          当前值: {maskIfNeeded(d.name, d.currVal)}
                        </div>
                      )}
                      {d.snapVal && (
                        <div className="rounded bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300 break-all">
                          快照值: {maskIfNeeded(d.name, d.snapVal)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
