import { useMemo, useState } from 'react'
import {
  Copy,
  Edit3,
  Eye,
  EyeOff,
  FolderOpen,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Terminal,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/dialog'
import { SelectField } from '@/components/ui/select-field'
import { SwitchField } from '@/components/ui/switch-field'
import { msg } from '@/components/ui/message'
import {
  envVarNameSchema,
  envVarValueSchema,
  isProtectedMachineVar,
  isSensitiveVarName,
  type EnvEntry,
  type EnvScope
} from '@/shared/envManagerModels'

export type MergedEnvItem = EnvEntry & {
  status: 'unchanged' | 'added' | 'modified' | 'deleted'
  originalRawValue?: string
}

interface Props {
  items: MergedEnvItem[]
  disabled: boolean
  onStageSet: (scope: EnvScope, name: string, value: string, isExpand: boolean) => void
  onStageDelete: (scope: EnvScope, name: string) => void
  onRevertSingle: (scope: EnvScope, name: string) => void
  onSwitchToPathTab: (scope: EnvScope) => void
}

const SCOPE_OPTIONS = [
  { value: 'All', label: '全部作用域 (用户 + 系统)' },
  { value: 'User', label: '仅用户变量 (HKCU)' },
  { value: 'Machine', label: '仅系统变量 (HKLM)' }
] as const

const FILTER_OPTIONS = [
  { value: 'all', label: '全部变量' },
  { value: 'modified', label: '待提交变更' },
  { value: 'expand', label: '含动态引用 (%VAR%)' },
  { value: 'sensitive', label: '敏感凭据变量' }
] as const

const COPY_MODE_OPTIONS = [
  { value: 'value', label: '复制格式：纯变量值' },
  { value: 'ps', label: '复制格式：PowerShell ($env:)' },
  { value: 'cmd', label: '复制格式：CMD (set)' },
  { value: 'dotenv', label: '复制格式：.env (KEY=VAL)' }
] as const

export function EnvVariablesView({
  items,
  disabled,
  onStageSet,
  onStageDelete,
  onRevertSingle,
  onSwitchToPathTab
}: Props) {
  const [scopeFilter, setScopeFilter] = useState<'All' | EnvScope>('All')
  const [kindFilter, setKindFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showExpanded, setShowExpanded] = useState(false)
  const [copyMode, setCopyMode] = useState<'value' | 'ps' | 'cmd' | 'dotenv'>('value')
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set())

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingOriginal, setEditingOriginal] = useState<{ scope: EnvScope; name: string } | null>(null)
  const [formScope, setFormScope] = useState<EnvScope>('User')
  const [formName, setFormName] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formExpand, setFormExpand] = useState(false)
  const [formError, setFormError] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(item => {
      if (scopeFilter !== 'All' && item.scope !== scopeFilter) return false
      if (kindFilter === 'modified' && item.status === 'unchanged') return false
      if (kindFilter === 'expand' && !item.isExpand && !item.rawValue.includes('%')) return false
      if (kindFilter === 'sensitive' && !isSensitiveVarName(item.name)) return false
      if (q) {
        const hitName = item.name.toLowerCase().includes(q)
        const hitRaw = item.rawValue.toLowerCase().includes(q)
        const hitExp = item.expandedValue.toLowerCase().includes(q)
        if (!hitName && !hitRaw && !hitExp) return false
      }
      return true
    })
  }, [items, scopeFilter, kindFilter, search])

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openCreate = () => {
    setEditingOriginal(null)
    setFormScope(scopeFilter === 'Machine' ? 'Machine' : 'User')
    setFormName('')
    setFormValue('')
    setFormExpand(false)
    setFormError('')
    setEditorOpen(true)
  }

  const openEdit = (item: MergedEnvItem) => {
    if (item.name.toLowerCase() === 'path') {
      onSwitchToPathTab(item.scope)
      return
    }
    setEditingOriginal({ scope: item.scope, name: item.name })
    setFormScope(item.scope)
    setFormName(item.name)
    setFormValue(item.rawValue)
    setFormExpand(item.isExpand || /%[^%]+%/.test(item.rawValue))
    setFormError('')
    setEditorOpen(true)
  }

  const pickDirectoryIntoValue = async () => {
    try {
      const dir = await window.toolDock.commands.chooseDirectory()
      if (!dir) return
      setFormValue(prev => (prev.trim() ? `${prev};${dir}` : dir))
    } catch (e) {
      msg.error(e)
    }
  }

  const submitForm = () => {
    const parsedName = envVarNameSchema.safeParse(formName)
    if (!parsedName.success) {
      setFormError(parsedName.error.issues[0]?.message || '变量名格式不合法')
      return
    }
    const parsedVal = envVarValueSchema.safeParse(formValue)
    if (!parsedVal.success) {
      setFormError(parsedVal.error.issues[0]?.message || '变量值不合法')
      return
    }
    if (isProtectedMachineVar(formScope, parsedName.data) && !parsedVal.data.trim()) {
      setFormError(`系统核心变量 "${parsedName.data}" 不能为空值`)
      return
    }
    onStageSet(
      formScope,
      parsedName.data,
      parsedVal.data,
      formExpand || /%[^%]+%/.test(parsedVal.data)
    )
    setEditorOpen(false)
  }

  const copyFormatted = async (item: MergedEnvItem) => {
    const val = showExpanded ? item.expandedValue : item.rawValue
    let text = val
    if (copyMode === 'ps') {
      text = `$env:${item.name} = "${val.replace(/`/g, '``').replace(/"/g, '`"')}"`
    } else if (copyMode === 'cmd') {
      text = `set "${item.name}=${val}"`
    } else if (copyMode === 'dotenv') {
      text = `${item.name}=${JSON.stringify(val)}`
    }
    try {
      await navigator.clipboard.writeText(text)
      msg.success(`已复制 ${item.name}`)
    } catch (e) {
      msg.error(e)
    }
  }

  const copyRefreshTerminalCmd = async () => {
    const cmd =
      '$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")'
    try {
      await navigator.clipboard.writeText(cmd)
      msg.success('已复制 PowerShell 当前终端刷新 Path 命令')
    } catch (e) {
      msg.error(e)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1 max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索变量名或路径值…"
                className="pl-9"
                aria-label="搜索环境变量"
              />
            </div>
            <SelectField
              ariaLabel="作用域筛选"
              value={scopeFilter}
              onValueChange={v => setScopeFilter(v as 'All' | EnvScope)}
              options={SCOPE_OPTIONS}
              className="w-[185px]"
            />
            <SelectField
              ariaLabel="类型筛选"
              value={kindFilter}
              onValueChange={setKindFilter}
              options={FILTER_OPTIONS}
              className="w-[165px]"
            />
            <SelectField
              ariaLabel="复制格式"
              value={copyMode}
              onValueChange={v => setCopyMode(v as 'value' | 'ps' | 'cmd' | 'dotenv')}
              options={COPY_MODE_OPTIONS}
              className="w-[190px]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs muted cursor-pointer select-none">
              <SwitchField
                checked={showExpanded}
                onCheckedChange={setShowExpanded}
                ariaLabel="切换显示展开后的实际值"
              />
              <span>{showExpanded ? '显示展开值' : '显示原始值'}</span>
            </label>
            <Button
              type="button"
              onClick={() => void copyRefreshTerminalCmd()}
              title="复制在已打开的 PowerShell 窗口中立即刷新 Path 的命令"
            >
              <Terminal size={15} /> 终端刷新命令
            </Button>
            <Button variant="primary" type="button" disabled={disabled} onClick={openCreate}>
              <Plus size={15} /> 新增变量
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3 text-xs muted">
          <span>共匹配 {filtered.length} 个环境变量（点击 Path 行可进入专项可视化分条编辑）</span>
          <span>提示：修改后在顶部点击「应用更改」一次性写入注册表并广播生效</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm muted">没有匹配的环境变量</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--panel-alt)] text-[11px] muted">
                  <th className="py-2.5 pl-5 pr-3 font-medium w-[110px]">作用域</th>
                  <th className="px-3 py-2.5 font-medium w-[240px]">变量名</th>
                  <th className="px-3 py-2.5 font-medium">
                    {showExpanded ? '展开后实际值 (Expanded)' : '注册表原始值 (Raw)'}
                  </th>
                  <th className="py-2.5 pl-3 pr-5 text-right font-medium w-[160px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map(item => {
                  const rowKey = `${item.scope}:${item.name}`
                  const sensitive = isSensitiveVarName(item.name)
                  const revealed = revealedKeys.has(rowKey)
                  const protectedVar = isProtectedMachineVar(item.scope, item.name)
                  const isPath = item.name.toLowerCase() === 'path'
                  const displayVal = showExpanded ? item.expandedValue : item.rawValue

                  return (
                    <tr
                      key={rowKey}
                      className={
                        'transition-colors hover:bg-[var(--hover)] ' +
                        (item.status === 'deleted'
                          ? 'opacity-50 line-through bg-red-500/5'
                          : item.status === 'added'
                            ? 'bg-emerald-500/5'
                            : item.status === 'modified'
                              ? 'bg-amber-500/5'
                              : '')
                      }
                    >
                      <td className="py-3 pl-5 pr-3 align-top whitespace-nowrap">
                        <span
                          className={
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ' +
                            (item.scope === 'Machine'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                              : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25')
                          }
                        >
                          {item.scope === 'Machine' ? '系统' : '用户'}
                        </span>
                      </td>

                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono font-semibold text-[var(--foreground)] break-all">
                            {item.name}
                          </span>
                          {protectedVar && (
                            <span
                              title="系统核心受保护变量，禁止删除或清空"
                              className="inline-flex items-center gap-0.5 rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] muted"
                            >
                              <Lock size={10} /> 保护
                            </span>
                          )}
                          {item.isExpand && (
                            <span
                              title="REG_EXPAND_SZ 动态展开字符串"
                              className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] text-sky-400"
                            >
                              %EXP%
                            </span>
                          )}
                          {item.status === 'added' && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
                              待新增
                            </span>
                          )}
                          {item.status === 'modified' && (
                            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-400">
                              已修改
                            </span>
                          )}
                          {item.status === 'deleted' && (
                            <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-400">
                              待删除
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3 align-top font-mono text-xs break-all">
                        {sensitive && !revealed ? (
                          <span className="tracking-widest muted select-none">••••••••••••••••</span>
                        ) : (
                          <span className="line-clamp-2" title={displayVal}>
                            {displayVal || <span className="muted italic">(空)</span>}
                          </span>
                        )}
                        {isPath && (
                          <button
                            type="button"
                            onClick={() => onSwitchToPathTab(item.scope)}
                            className="ml-2 inline-flex items-center rounded bg-[var(--primary)]/15 px-2 py-0.5 font-sans text-[11px] text-[var(--primary)] hover:underline"
                          >
                            专项分条管理 →
                          </button>
                        )}
                      </td>

                      <td className="py-2.5 pl-3 pr-5 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {sensitive && (
                            <Button
                              type="button"
                              className="h-7 px-2"
                              onClick={() => toggleReveal(rowKey)}
                              title={revealed ? '隐藏敏感值' : '显示敏感值'}
                            >
                              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                            </Button>
                          )}
                          <Button
                            type="button"
                            className="h-7 px-2"
                            onClick={() => void copyFormatted(item)}
                            title="按当前所选格式复制"
                          >
                            <Copy size={13} />
                          </Button>
                          {item.status !== 'unchanged' && (
                            <Button
                              type="button"
                              className="h-7 px-2 text-amber-400"
                              disabled={disabled}
                              onClick={() => onRevertSingle(item.scope, item.name)}
                              title="撤销此变量的暂存修改"
                            >
                              <RotateCcw size={13} />
                            </Button>
                          )}
                          {item.status !== 'deleted' && (
                            <Button
                              type="button"
                              className="h-7 px-2"
                              disabled={disabled}
                              onClick={() => openEdit(item)}
                              title={isPath ? '进入 Path 专项编辑器' : '编辑变量'}
                            >
                              <Edit3 size={13} />
                            </Button>
                          )}
                          {item.status !== 'deleted' && (
                            <Button
                              type="button"
                              className="h-7 px-2 text-red-400 hover:text-red-300"
                              disabled={disabled || protectedVar || isPath}
                              onClick={() => onStageDelete(item.scope, item.name)}
                              title={
                                protectedVar || isPath
                                  ? '系统核心变量禁止直接删除'
                                  : '标记删除该变量'
                              }
                            >
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingOriginal ? `编辑变量 · ${editingOriginal.name}` : '新增环境变量'}
        width="md"
        footer={
          <>
            <Button type="button" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button variant="primary" type="button" onClick={submitForm}>
              暂存更改
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium muted">作用域</span>
              <SelectField
                ariaLabel="变量作用域"
                value={formScope}
                disabled={Boolean(editingOriginal)}
                onValueChange={v => setFormScope(v as EnvScope)}
                options={[
                  { value: 'User', label: '用户变量 (User - 当前账户)' },
                  { value: 'Machine', label: '系统变量 (Machine - 全局需 UAC)' }
                ]}
                className="w-full"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium muted">注册表类型</span>
              <div className="flex h-10 items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] px-3">
                <span className="text-xs">
                  {formExpand || /%[^%]+%/.test(formValue) ? 'REG_EXPAND_SZ (动态展开)' : 'REG_SZ (普通文本)'}
                </span>
                <SwitchField
                  checked={formExpand || /%[^%]+%/.test(formValue)}
                  onCheckedChange={setFormExpand}
                  ariaLabel="启用动态变量引用展开"
                />
              </div>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium muted">变量名</span>
            <Input
              value={formName}
              disabled={Boolean(editingOriginal)}
              onChange={e => {
                setFormName(e.target.value)
                setFormError('')
              }}
              placeholder="例如 JAVA_HOME 或 HTTP_PROXY"
              spellCheck={false}
              className="font-mono"
            />
          </label>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium muted">变量值</span>
              <Button type="button" className="h-7 px-2.5 text-xs" onClick={() => void pickDirectoryIntoValue()}>
                <FolderOpen size={13} /> 选择目录填入
              </Button>
            </div>
            <textarea
              value={formValue}
              onChange={e => {
                setFormValue(e.target.value)
                setFormError('')
              }}
              rows={4}
              spellCheck={false}
              placeholder="输入变量值，支持 %JAVA_HOME% 等动态引用"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3 font-mono text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            />
          </div>

          {formError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {formError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
