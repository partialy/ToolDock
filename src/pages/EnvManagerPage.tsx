import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Eye,
  History,
  Layers,
  List,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Terminal
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { ToolPageIcon } from '@/components/ui/tool-page-icon'
import { useDialog } from '@/components/ui/dialog-provider'
import { msg } from '@/components/ui/message'
import {
  isSensitiveVarName,
  validateEnvOperationsGuardrails,
  type EnvEntry,
  type EnvMutationOp,
  type EnvScope,
  type EnvSnapshotSummary,
  type EnvStateSnapshot,
  type EnvSwitchGroup,
  type EnvSwitchGroupInput
} from '@/shared/envManagerModels'
import { EnvVariablesView, type MergedEnvItem } from '@/components/env-manager/EnvVariablesView'
import { EnvPathView } from '@/components/env-manager/EnvPathView'
import { EnvProfilesView } from '@/components/env-manager/EnvProfilesView'
import { EnvSnapshotsView } from '@/components/env-manager/EnvSnapshotsView'

type Tab = 'variables' | 'path' | 'profiles' | 'snapshots'

function expandClientValue(raw: string, entries: EnvEntry[]): string {
  const map = new Map<string, string>()
  for (const e of entries) {
    if (e.scope === 'Machine') map.set(e.name.toLowerCase(), e.expandedValue || e.rawValue)
  }
  for (const e of entries) {
    if (e.scope === 'User') map.set(e.name.toLowerCase(), e.expandedValue || e.rawValue)
  }
  return raw.replace(/%([^%]+)%/g, (full, name: string) => {
    const v = map.get(name.toLowerCase())
    return v !== undefined ? v : full
  })
}

export function EnvManagerPage() {
  const dialog = useDialog()
  const [tab, setTab] = useState<Tab>('variables')
  const [pathScope, setPathScope] = useState<EnvScope>('User')

  const [state, setState] = useState<EnvStateSnapshot | null>(null)
  const [groups, setGroups] = useState<EnvSwitchGroup[]>([])
  const [snapshots, setSnapshots] = useState<EnvSnapshotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  // Staged changes keyed by `${scope}:${name.toLowerCase()}`
  const [stagedMap, setStagedMap] = useState<Map<string, EnvMutationOp>>(new Map())
  const [diffModalOpen, setDiffModalOpen] = useState(false)

  const stagedOperations = useMemo(() => Array.from(stagedMap.values()), [stagedMap])
  const hasUnsaved = stagedOperations.length > 0

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('tooldock:unsaved', { detail: hasUnsaved }))
    return () => {
      window.dispatchEvent(new CustomEvent('tooldock:unsaved', { detail: false }))
    }
  }, [hasUnsaved])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [envState, groupList, snapList] = await Promise.all([
        window.toolDock.envManager.getState(),
        window.toolDock.envManager.listGroups(),
        window.toolDock.envManager.listSnapshots()
      ])
      setState(envState)
      setGroups(groupList)
      setSnapshots(snapList)
    } catch (e) {
      msg.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  // Merge original state + staged operations for live UI preview
  const mergedItems: MergedEnvItem[] = useMemo(() => {
    if (!state) return []
    const baseAll = [...state.user, ...state.machine]
    const result: MergedEnvItem[] = []
    const handledKeys = new Set<string>()

    for (const orig of baseAll) {
      const key = `${orig.scope}:${orig.name.toLowerCase()}`
      const op = stagedMap.get(key)
      if (!op) {
        result.push({ ...orig, status: 'unchanged' })
      } else if (op.kind === 'delete') {
        handledKeys.add(key)
        result.push({ ...orig, status: 'deleted', originalRawValue: orig.rawValue })
      } else if (op.kind === 'set') {
        handledKeys.add(key)
        result.push({
          scope: orig.scope,
          name: op.name,
          rawValue: op.value,
          expandedValue: expandClientValue(op.value, baseAll),
          isExpand: op.isExpand,
          status: op.value === orig.rawValue && op.isExpand === orig.isExpand ? 'unchanged' : 'modified',
          originalRawValue: orig.rawValue
        })
      }
    }

    for (const [key, op] of stagedMap.entries()) {
      if (handledKeys.has(key)) continue
      if (op.kind === 'set') {
        result.push({
          scope: op.scope,
          name: op.name,
          rawValue: op.value,
          expandedValue: expandClientValue(op.value, baseAll),
          isExpand: op.isExpand,
          status: 'added'
        })
      }
    }

    return result.sort((a, b) =>
      a.scope === b.scope
        ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        : a.scope === 'User'
          ? -1
          : 1
    )
  }, [state, stagedMap])

  const stageSet = (scope: EnvScope, name: string, value: string, isExpand: boolean) => {
    const key = `${scope}:${name.toLowerCase()}`
    const origList = scope === 'Machine' ? state?.machine : state?.user
    const orig = origList?.find(e => e.name.toLowerCase() === name.toLowerCase())

    setStagedMap(prev => {
      const next = new Map(prev)
      if (orig && orig.rawValue === value && orig.isExpand === isExpand) {
        next.delete(key)
      } else {
        next.set(key, { kind: 'set', scope, name: orig?.name || name, value, isExpand })
      }
      return next
    })
  }

  const stageDelete = (scope: EnvScope, name: string) => {
    const key = `${scope}:${name.toLowerCase()}`
    const origList = scope === 'Machine' ? state?.machine : state?.user
    const orig = origList?.find(e => e.name.toLowerCase() === name.toLowerCase())

    setStagedMap(prev => {
      const next = new Map(prev)
      if (!orig) {
        next.delete(key)
      } else {
        next.set(key, { kind: 'delete', scope, name: orig.name })
      }
      return next
    })
  }

  const revertSingle = (scope: EnvScope, name: string) => {
    const key = `${scope}:${name.toLowerCase()}`
    setStagedMap(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }

  const stagePathChange = (scope: EnvScope, nextRawPath: string) => {
    const origList = scope === 'Machine' ? state?.machine : state?.user
    const origPath = origList?.find(e => e.name.toLowerCase() === 'path')
    stageSet(
      scope,
      origPath?.name || 'Path',
      nextRawPath,
      Boolean(origPath?.isExpand || /%[^%]+%/.test(nextRawPath))
    )
  }

  const applyStagedChanges = async () => {
    if (stagedOperations.length === 0 || working) return
    const guardError = validateEnvOperationsGuardrails(stagedOperations)
    if (guardError) {
      msg.error(guardError)
      return
    }

    const hasMachineOp = stagedOperations.some(op => op.scope === 'Machine')
    if (hasMachineOp && !state?.isAdmin) {
      const confirmed = await dialog.confirm({
        title: '应用系统环境变量变更？',
        variant: 'warning',
        confirmText: '授权并应用',
        description: `待提交变更中包含系统级 (Machine) 环境变量，Windows 将弹出一次 UAC 管理员授权窗口以写入注册表并广播生效。`
      })
      if (!confirmed) return
    }

    setWorking(true)
    try {
      const nextState = await window.toolDock.envManager.applyChanges({
        operations: stagedOperations,
        reason: `手动修改环境变量 (${stagedOperations.length} 项)`
      })
      setState(nextState)
      setStagedMap(new Map())
      setDiffModalOpen(false)
      const snapList = await window.toolDock.envManager.listSnapshots()
      setSnapshots(snapList)
      msg.success('环境变量已写入注册表并发送系统广播，新打开的终端立即生效')
    } catch (e) {
      msg.error(e)
    } finally {
      setWorking(false)
    }
  }

  const handleActivateCandidate = async (groupId: string, candidateId: string | null) => {
    if (working) return
    setWorking(true)
    try {
      const nextState = await window.toolDock.envManager.activateCandidate(groupId, candidateId)
      setState(nextState)
      const snapList = await window.toolDock.envManager.listSnapshots()
      setSnapshots(snapList)
      msg.success(candidateId ? '已切换环境预设并广播系统生效' : '已停用该环境预设组')
    } catch (e) {
      msg.error(e)
    } finally {
      setWorking(false)
    }
  }

  const busy = loading || working

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      {/* 顶部标题栏 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] text-[var(--primary)]">
            <ToolPageIcon size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold">系统环境变量管理</h1>
              {state && (
                <span
                  className={
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ' +
                    (state.isAdmin
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                      : 'bg-sky-500/15 text-sky-400 border border-sky-500/25')
                  }
                >
                  {state.isAdmin ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                  {state.isAdmin ? '管理员权限运行中' : '普通权限（系统变量修改时按需 UAC 提权）'}
                </span>
              )}
            </div>
            <p className="text-xs muted">
              管理 Windows 用户与系统环境变量、Path 分条排序与冲突探测、SDK 多版本一键切换及自动快照回滚
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" disabled={busy} onClick={() => void loadAll()}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 刷新系统状态
          </Button>
        </div>
      </div>

      {/* 待提交变更浮动常驻栏 */}
      {hasUnsaved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 font-semibold text-amber-400">
              {stagedOperations.length}
            </span>
            <div>
              <span className="font-semibold text-[var(--foreground)]">
                存在 {stagedOperations.length} 项待应用的环境变量变更
              </span>
              <span className="ml-2 muted">
                （点击「应用更改」将自动生成变更前快照、一次性写入注册表并广播 WM_SETTINGCHANGE）
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" disabled={busy} onClick={() => setDiffModalOpen(true)}>
              <Eye size={14} /> 查看变更明细
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => setStagedMap(new Map())}
            >
              <RotateCcw size={14} /> 放弃暂存
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={busy}
              onClick={() => void applyStagedChanges()}
            >
              <CheckCircle2 size={15} /> {working ? '正在写入注册表…' : '应用更改'}
            </Button>
          </div>
        </div>
      )}

      {/* 导航 Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
        <Button
          variant={tab === 'variables' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setTab('variables')}
        >
          <List size={15} /> 变量管理 ({mergedItems.length})
        </Button>
        <Button
          variant={tab === 'path' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setTab('path')}
        >
          <Terminal size={15} /> Path 专项与命令探测
        </Button>
        <Button
          variant={tab === 'profiles' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setTab('profiles')}
        >
          <Layers size={15} /> 一键版本/环境切换 ({groups.length})
        </Button>
        <Button
          variant={tab === 'snapshots' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setTab('snapshots')}
        >
          <History size={15} /> 快照备份与回滚 ({snapshots.length})
        </Button>
      </div>

      {/* 主视图区 */}
      {loading && !state ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-12 text-center text-sm muted">
          正在读取 Windows 注册表环境变量…
        </div>
      ) : (
        <>
          {tab === 'variables' && (
            <EnvVariablesView
              items={mergedItems}
              disabled={busy}
              onStageSet={stageSet}
              onStageDelete={stageDelete}
              onRevertSingle={revertSingle}
              onSwitchToPathTab={targetScope => {
                setPathScope(targetScope)
                setTab('path')
              }}
            />
          )}

          {tab === 'path' && (
            <EnvPathView
              scope={pathScope}
              onScopeChange={setPathScope}
              allItems={mergedItems}
              pathDirectoriesExist={state?.pathDirectoriesExist || {}}
              disabled={busy}
              onStagePathChange={stagePathChange}
            />
          )}

          {tab === 'profiles' && (
            <EnvProfilesView
              groups={groups}
              userEntries={state?.user || []}
              machineEntries={state?.machine || []}
              disabled={busy}
              onSaveGroup={async input => {
                const next = await window.toolDock.envManager.saveGroup(input as EnvSwitchGroupInput)
                setGroups(next)
              }}
              onRemoveGroup={async id => {
                const next = await window.toolDock.envManager.removeGroup(id)
                setGroups(next)
              }}
              onActivateCandidate={handleActivateCandidate}
            />
          )}

          {tab === 'snapshots' && (
            <EnvSnapshotsView
              snapshots={snapshots}
              userEntries={state?.user || []}
              machineEntries={state?.machine || []}
              disabled={busy}
              onCreateSnapshot={async title => {
                const next = await window.toolDock.envManager.createSnapshot(title)
                setSnapshots(next)
                msg.success('已创建环境变量快照')
              }}
              onRemoveSnapshot={async id => {
                const next = await window.toolDock.envManager.removeSnapshot(id)
                setSnapshots(next)
                msg.success('已删除快照')
              }}
              onRestoreSnapshot={async id => {
                setWorking(true)
                try {
                  const nextState = await window.toolDock.envManager.restoreSnapshot(id)
                  setState(nextState)
                  setStagedMap(new Map())
                  const nextSnaps = await window.toolDock.envManager.listSnapshots()
                  setSnapshots(nextSnaps)
                  msg.success('已成功回滚环境变量并广播生效')
                } catch (e) {
                  msg.error(e)
                } finally {
                  setWorking(false)
                }
              }}
              onExportSnapshot={async id => {
                try {
                  const filePath = await window.toolDock.envManager.exportSnapshot(id)
                  if (filePath) msg.success(`已导出备份至 ${filePath}`)
                } catch (e) {
                  msg.error(e)
                }
              }}
              onImportSnapshot={async () => {
                try {
                  const imported = await window.toolDock.envManager.importSnapshot()
                  if (imported) {
                    const [nextSnaps, nextGroups] = await Promise.all([
                      window.toolDock.envManager.listSnapshots(),
                      window.toolDock.envManager.listGroups()
                    ])
                    setSnapshots(nextSnaps)
                    setGroups(nextGroups)
                    msg.success(`已导入快照「${imported.title}」，可在列表中对比或回滚`)
                  }
                } catch (e) {
                  msg.error(e)
                }
              }}
            />
          )}
        </>
      )}

      {/* 待提交变更 Diff 预览弹窗 */}
      <Modal
        open={diffModalOpen}
        onOpenChange={setDiffModalOpen}
        title={`待应用变更明细 (${stagedOperations.length} 项)`}
        width="lg"
        footer={
          <>
            <Button type="button" onClick={() => setDiffModalOpen(false)}>
              关闭
            </Button>
            <Button
              variant="primary"
              type="button"
              disabled={busy}
              onClick={() => void applyStagedChanges()}
            >
              <CheckCircle2 size={15} /> 确认写入注册表
            </Button>
          </>
        }
      >
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
          {stagedOperations.map(op => {
            const origList = op.scope === 'Machine' ? state?.machine : state?.user
            const orig = origList?.find(e => e.name.toLowerCase() === op.name.toLowerCase())
            const sensitive = isSensitiveVarName(op.name)
            return (
              <div
                key={`${op.scope}:${op.name}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[var(--panel)] px-1.5 py-0.5 text-[10px] muted">
                      {op.scope === 'Machine' ? '系统 (HKLM)' : '用户 (HKCU)'}
                    </span>
                    <span className="font-mono font-semibold">{op.name}</span>
                  </div>
                  <span
                    className={
                      'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                      (op.kind === 'delete'
                        ? 'bg-red-500/20 text-red-400'
                        : orig
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-emerald-500/20 text-emerald-400')
                    }
                  >
                    {op.kind === 'delete' ? '删除变量' : orig ? '修改变量' : '新增变量'}
                  </span>
                </div>

                {orig && (
                  <div className="rounded bg-red-500/10 px-2.5 py-1.5 font-mono text-[11px] text-red-300 break-all">
                    原值: {sensitive ? '••••••••••••' : orig.rawValue}
                  </div>
                )}
                {op.kind === 'set' && (
                  <div className="rounded bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300 break-all">
                    新值: {sensitive ? '••••••••••••' : op.value}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
