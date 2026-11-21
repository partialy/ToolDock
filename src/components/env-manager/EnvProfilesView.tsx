import { useState } from 'react'
import {
  CheckCircle2,
  Edit3,
  FolderOpen,
  Layers,
  Play,
  Plus,
  PowerOff,
  Sparkles,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/dialog'
import { SelectField } from '@/components/ui/select-field'
import { useDialog } from '@/components/ui/dialog-provider'
import { msg } from '@/components/ui/message'
import {
  detectActiveCandidateId,
  envSwitchGroupInputSchema,
  splitPathEntries,
  type EnvEntry,
  type EnvScope,
  type EnvSwitchCandidate,
  type EnvSwitchGroup,
  type EnvSwitchGroupInput
} from '@/shared/envManagerModels'

interface Props {
  groups: EnvSwitchGroup[]
  userEntries: EnvEntry[]
  machineEntries: EnvEntry[]
  disabled: boolean
  onSaveGroup: (input: EnvSwitchGroupInput) => Promise<void>
  onRemoveGroup: (id: string) => Promise<void>
  onActivateCandidate: (groupId: string, candidateId: string | null) => Promise<void>
}

type GroupTemplate = {
  label: string
  name: string
  scope: EnvScope
  candidates: EnvSwitchCandidate[]
}

const TEMPLATES: GroupTemplate[] = [
  {
    label: 'Java 多版本 (JAVA_HOME)',
    name: 'Java SDK 版本',
    scope: 'User',
    candidates: [
      {
        id: 'jdk-21',
        name: 'JDK 21 LTS',
        variables: [{ name: 'JAVA_HOME', value: 'C:\\Program Files\\Java\\jdk-21', isExpand: false }],
        pathEntries: ['%JAVA_HOME%\\bin']
      },
      {
        id: 'jdk-17',
        name: 'JDK 17 LTS',
        variables: [{ name: 'JAVA_HOME', value: 'C:\\Program Files\\Java\\jdk-17', isExpand: false }],
        pathEntries: ['%JAVA_HOME%\\bin']
      },
      {
        id: 'jdk-8',
        name: 'JDK 8',
        variables: [{ name: 'JAVA_HOME', value: 'C:\\Program Files\\Java\\jdk1.8.0', isExpand: false }],
        pathEntries: ['%JAVA_HOME%\\bin']
      }
    ]
  },
  {
    label: '终端代理 (HTTP_PROXY)',
    name: '命令行终端代理',
    scope: 'User',
    candidates: [
      {
        id: 'proxy-local-7890',
        name: '本地代理 (127.0.0.1:7890)',
        variables: [
          { name: 'HTTP_PROXY', value: 'http://127.0.0.1:7890', isExpand: false },
          { name: 'HTTPS_PROXY', value: 'http://127.0.0.1:7890', isExpand: false }
        ],
        pathEntries: []
      },
      {
        id: 'proxy-local-10809',
        name: '本地代理 (127.0.0.1:10809)',
        variables: [
          { name: 'HTTP_PROXY', value: 'http://127.0.0.1:10809', isExpand: false },
          { name: 'HTTPS_PROXY', value: 'http://127.0.0.1:10809', isExpand: false }
        ],
        pathEntries: []
      }
    ]
  },
  {
    label: 'Go 环境 (GOROOT)',
    name: 'Go SDK 版本',
    scope: 'User',
    candidates: [
      {
        id: 'go-default',
        name: 'Go 1.23',
        variables: [
          { name: 'GOROOT', value: 'C:\\Program Files\\Go', isExpand: false },
          { name: 'GOPROXY', value: 'https://goproxy.cn,direct', isExpand: false }
        ],
        pathEntries: ['%GOROOT%\\bin']
      }
    ]
  },
  {
    label: 'Maven 版本 (MAVEN_HOME)',
    name: 'Maven 版本',
    scope: 'User',
    candidates: [
      {
        id: 'maven-39',
        name: 'Maven 3.9',
        variables: [{ name: 'MAVEN_HOME', value: 'D:\\Tools\\apache-maven-3.9.9', isExpand: false }],
        pathEntries: ['%MAVEN_HOME%\\bin']
      }
    ]
  }
]

function makeId() {
  return 'cand-' + Math.random().toString(36).slice(2, 10)
}

export function EnvProfilesView({
  groups,
  userEntries,
  machineEntries,
  disabled,
  onSaveGroup,
  onRemoveGroup,
  onActivateCandidate
}: Props) {
  const dialog = useDialog()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | undefined>(undefined)
  const [groupName, setGroupName] = useState('')
  const [groupScope, setGroupScope] = useState<EnvScope>('User')
  const [candidates, setCandidates] = useState<EnvSwitchCandidate[]>([])
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const openFromTemplate = (tpl?: GroupTemplate) => {
    setEditingId(undefined)
    if (tpl) {
      setGroupName(tpl.name)
      setGroupScope(tpl.scope)
      setCandidates(
        tpl.candidates.map(c => ({
          ...c,
          id: makeId(),
          variables: c.variables.map(v => ({ ...v })),
          pathEntries: [...c.pathEntries]
        }))
      )
    } else {
      setGroupName('')
      setGroupScope('User')
      setCandidates([
        {
          id: makeId(),
          name: '默认方案',
          variables: [{ name: 'JAVA_HOME', value: '', isExpand: false }],
          pathEntries: ['%JAVA_HOME%\\bin']
        }
      ])
    }
    setFormError('')
    setModalOpen(true)
  }

  const openEditGroup = (group: EnvSwitchGroup) => {
    setEditingId(group.id)
    setGroupName(group.name)
    setGroupScope(group.scope)
    setCandidates(
      group.candidates.map(c => ({
        ...c,
        variables: c.variables.map(v => ({ ...v })),
        pathEntries: [...c.pathEntries]
      }))
    )
    setFormError('')
    setModalOpen(true)
  }

  const updateCandidate = (idx: number, patch: Partial<EnvSwitchCandidate>) => {
    setCandidates(prev => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  const pickDirectoryForVar = async (candIdx: number, varIdx: number) => {
    try {
      const dir = await window.toolDock.commands.chooseDirectory()
      if (!dir) return
      setCandidates(prev =>
        prev.map((c, ci) =>
          ci !== candIdx
            ? c
            : {
                ...c,
                variables: c.variables.map((v, vi) => (vi === varIdx ? { ...v, value: dir } : v))
              }
        )
      )
    } catch (e) {
      msg.error(e)
    }
  }

  const handleSave = async () => {
    const parsed = envSwitchGroupInputSchema.safeParse({
      id: editingId,
      name: groupName,
      scope: groupScope,
      candidates
    })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || '请检查表单填写内容')
      return
    }
    setSaving(true)
    try {
      await onSaveGroup(parsed.data)
      setModalOpen(false)
      msg.success(editingId ? '已更新环境切换组' : '已创建环境切换组')
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteGroup = async (group: EnvSwitchGroup) => {
    const yes = await dialog.confirm({
      title: '删除版本切换组？',
      variant: 'danger',
      confirmText: '确认删除',
      description: `将删除预设组「${group.name}」（不会清除已写入系统的环境变量）。`
    })
    if (!yes) return
    await onRemoveGroup(group.id)
    msg.success('已删除切换组')
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">一键切换版本 / 环境预设组</h3>
            <p className="mt-0.5 text-xs muted">
              点击任一方案即可一步完成「自动备份快照 → 写入环境变量与关联 Path → 广播系统立即生效」。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TEMPLATES.map(tpl => (
              <Button
                key={tpl.label}
                type="button"
                disabled={disabled}
                onClick={() => openFromTemplate(tpl)}
              >
                <Sparkles size={14} /> + {tpl.label}
              </Button>
            ))}
            <Button variant="primary" type="button" disabled={disabled} onClick={() => openFromTemplate()}>
              <Plus size={15} /> 自定义切换组
            </Button>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-12 text-center space-y-3">
          <Layers size={32} className="mx-auto muted" />
          <div className="text-sm font-medium">暂无版本或环境切换预设</div>
          <p className="mx-auto max-w-md text-xs muted">
            点击上方模板（如「Java 多版本」「终端代理」「Go 环境」）可快速创建常用开发环境切换组。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {groups.map(group => {
            const scopeEntries = group.scope === 'Machine' ? machineEntries : userEntries
            const activeId = detectActiveCandidateId(group, scopeEntries)

            return (
              <div
                key={group.id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-semibold">{group.name}</h4>
                        <span
                          className={
                            'rounded px-2 py-0.5 text-[11px] font-medium ' +
                            (group.scope === 'Machine'
                              ? 'bg-amber-500/15 text-amber-400'
                              : 'bg-indigo-500/15 text-indigo-400')
                          }
                        >
                          {group.scope === 'Machine' ? '系统级 (HKLM)' : '用户级 (HKCU)'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs muted">
                        {activeId
                          ? `当前已激活：${group.candidates.find(c => c.id === activeId)?.name}`
                          : '当前未匹配任一候选方案'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        className="h-8 px-2.5 text-xs"
                        disabled={disabled}
                        onClick={() => void onActivateCandidate(group.id, null)}
                        title="清除此组变量与关联专属 Path 项（例如关闭代理）"
                      >
                        <PowerOff size={13} /> 停用
                      </Button>
                      <Button
                        type="button"
                        className="h-8 px-2.5"
                        disabled={disabled}
                        onClick={() => openEditGroup(group)}
                        title="编辑切换组"
                      >
                        <Edit3 size={14} />
                      </Button>
                      <Button
                        type="button"
                        className="h-8 px-2.5 text-red-400"
                        disabled={disabled}
                        onClick={() => void confirmDeleteGroup(group)}
                        title="删除切换组"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {group.candidates.map(cand => {
                      const isActive = activeId === cand.id
                      return (
                        <div
                          key={cand.id}
                          className={
                            'flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ' +
                            (isActive
                              ? 'border-emerald-500/40 bg-emerald-500/10'
                              : 'border-[var(--border)] bg-[var(--panel-alt)]')
                          }
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs">{cand.name}</span>
                              {isActive && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                                  <CheckCircle2 size={11} /> 当前生效
                                </span>
                              )}
                            </div>

                            <div className="space-y-0.5 font-mono text-[11px] muted">
                              {cand.variables.map(v => (
                                <div key={v.name} className="truncate" title={`${v.name}=${v.value}`}>
                                  {v.name} = {v.value}
                                </div>
                              ))}
                              {cand.pathEntries.length > 0 && (
                                <div className="truncate text-sky-400/90" title={cand.pathEntries.join(';')}>
                                  +Path: {cand.pathEntries.join(' ; ')}
                                </div>
                              )}
                            </div>
                          </div>

                          <Button
                            variant={isActive ? 'secondary' : 'primary'}
                            type="button"
                            disabled={disabled}
                            onClick={() => void onActivateCandidate(group.id, cand.id)}
                            className="shrink-0"
                          >
                            <Play size={13} /> {isActive ? '重新应用' : '一键切换'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? '编辑版本/环境切换组' : '新建版本/环境切换组'}
        width="lg"
        footer={
          <>
            <Button type="button" onClick={() => setModalOpen(false)}>
              取消
            </Button>
            <Button variant="primary" type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? '保存中…' : '保存切换组'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium muted">切换组名称</span>
              <Input
                value={groupName}
                onChange={e => {
                  setGroupName(e.target.value)
                  setFormError('')
                }}
                placeholder="例如：Java SDK 版本 / 终端代理"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium muted">目标作用域</span>
              <SelectField
                ariaLabel="切换组目标作用域"
                value={groupScope}
                onValueChange={v => setGroupScope(v as EnvScope)}
                options={[
                  { value: 'User', label: '用户变量 (User - 免 UAC 推荐)' },
                  { value: 'Machine', label: '系统变量 (Machine - 全局)' }
                ]}
                className="w-full"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">候选方案列表 ({candidates.length})</span>
              <Button
                type="button"
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  const sampleVars =
                    candidates[0]?.variables.map(v => ({ name: v.name, value: '', isExpand: v.isExpand })) || [
                      { name: '', value: '', isExpand: false }
                    ]
                  const samplePaths = candidates[0]?.pathEntries ? [...candidates[0].pathEntries] : []
                  setCandidates(prev => [
                    ...prev,
                    {
                      id: makeId(),
                      name: `方案 ${prev.length + 1}`,
                      variables: sampleVars,
                      pathEntries: samplePaths
                    }
                  ])
                }}
              >
                <Plus size={13} /> 添加候选方案
              </Button>
            </div>

            {candidates.map((cand, cIdx) => (
              <div
                key={cand.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--panel-alt)] p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={cand.name}
                    onChange={e => updateCandidate(cIdx, { name: e.target.value })}
                    placeholder="方案名称，例如 JDK 21"
                    className="max-w-xs font-medium"
                  />
                  {candidates.length > 1 && (
                    <Button
                      type="button"
                      className="h-7 px-2 text-xs text-red-400"
                      onClick={() => setCandidates(prev => prev.filter((_, i) => i !== cIdx))}
                    >
                      <Trash2 size={13} /> 删除方案
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] muted">
                    <span>环境变量键值对</span>
                    <button
                      type="button"
                      onClick={() =>
                        updateCandidate(cIdx, {
                          variables: [...cand.variables, { name: '', value: '', isExpand: false }]
                        })
                      }
                      className="text-[var(--primary)] hover:underline"
                    >
                      + 新增变量行
                    </button>
                  </div>

                  {cand.variables.map((v, vIdx) => (
                    <div key={vIdx} className="flex items-center gap-2">
                      <Input
                        value={v.name}
                        onChange={e => {
                          const nextVars = cand.variables.map((item, i) =>
                            i === vIdx ? { ...item, name: e.target.value } : item
                          )
                          updateCandidate(cIdx, { variables: nextVars })
                        }}
                        placeholder="变量名 (如 JAVA_HOME)"
                        spellCheck={false}
                        className="w-[170px] shrink-0 font-mono text-xs"
                      />
                      <Input
                        value={v.value}
                        onChange={e => {
                          const nextVars = cand.variables.map((item, i) =>
                            i === vIdx ? { ...item, value: e.target.value } : item
                          )
                          updateCandidate(cIdx, { variables: nextVars })
                        }}
                        placeholder="变量值 (如 C:\Program Files\Java\jdk-21)"
                        spellCheck={false}
                        className="flex-1 font-mono text-xs"
                      />
                      <Button
                        type="button"
                        className="h-9 px-2.5 shrink-0"
                        onClick={() => void pickDirectoryForVar(cIdx, vIdx)}
                        title="浏览选择目录"
                      >
                        <FolderOpen size={14} />
                      </Button>
                      {cand.variables.length > 1 && (
                        <Button
                          type="button"
                          className="h-9 px-2 text-red-400 shrink-0"
                          onClick={() =>
                            updateCandidate(cIdx, {
                              variables: cand.variables.filter((_, i) => i !== vIdx)
                            })
                          }
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] muted">
                    关联确保写入 Path 的条目（可选，多条用分号 ; 分隔，例如 %JAVA_HOME%\bin）
                  </span>
                  <Input
                    value={cand.pathEntries.join(';')}
                    onChange={e =>
                      updateCandidate(cIdx, {
                        pathEntries: splitPathEntries(e.target.value)
                      })
                    }
                    placeholder="例如 %JAVA_HOME%\bin"
                    spellCheck={false}
                    className="font-mono text-xs"
                  />
                </label>
              </div>
            ))}
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
