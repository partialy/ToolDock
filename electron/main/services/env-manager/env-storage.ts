import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { BrowserWindow, dialog } from 'electron'
import { getDataRoot } from '../../database/store'
import {
  envApplyInputSchema,
  envSwitchGroupInputSchema,
  joinPathEntries,
  normalizeWinPathForCompare,
  splitPathEntries,
  validateEnvOperationsGuardrails,
  type EnvApplyInput,
  type EnvEntry,
  type EnvMutationOp,
  type EnvSnapshotDetail,
  type EnvSnapshotItem,
  type EnvSnapshotSummary,
  type EnvStateSnapshot,
  type EnvSwitchGroup,
  type EnvSwitchGroupInput,
  type WhereIsResult
} from '../../../../src/shared/envManagerModels'
import {
  applyWindowsEnvOperations,
  readWindowsEnvState,
  resolveWhereIsFromState
} from './env-registry'

const MAX_AUTO_SNAPSHOTS = 30
const MAX_MANUAL_SNAPSHOTS = 50

function envToolDir(): string {
  const dir = path.join(getDataRoot(), 'tools', 'env-manager')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function profilesFilePath(): string {
  return path.join(envToolDir(), 'profiles.json')
}

function snapshotsFilePath(): string {
  return path.join(envToolDir(), 'snapshots.json')
}

function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmp = `${filePath}.${randomUUID()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function computeGroupActivationOperations(
  group: EnvSwitchGroup,
  candidateId: string | null,
  state: EnvStateSnapshot
): EnvMutationOp[] {
  const targetCandidate = candidateId
    ? group.candidates.find(c => c.id === candidateId) || null
    : null
  if (candidateId && !targetCandidate) {
    throw Error('未找到指定的候选方案')
  }

  const scopeEntries = group.scope === 'Machine' ? state.machine : state.user
  const currentMap = new Map<string, EnvEntry>()
  for (const entry of scopeEntries) {
    currentMap.set(entry.name.toLowerCase(), entry)
  }

  const ops: EnvMutationOp[] = []

  // Collect all variable names managed across all candidates in this group
  const allManagedVarNames = new Map<string, string>()
  for (const cand of group.candidates) {
    for (const v of cand.variables) {
      allManagedVarNames.set(v.name.toLowerCase(), v.name)
    }
  }

  if (targetCandidate) {
    const activeLowerNames = new Set<string>()
    for (const v of targetCandidate.variables) {
      const lower = v.name.toLowerCase()
      activeLowerNames.add(lower)
      ops.push({
        kind: 'set',
        scope: group.scope,
        name: v.name,
        value: v.value,
        isExpand: v.isExpand || /%[^%]+%/.test(v.value)
      })
    }
    // Remove variables that belonged to other candidates in this group but not in the newly activated candidate
    for (const [lower, originalName] of allManagedVarNames.entries()) {
      if (!activeLowerNames.has(lower) && currentMap.has(lower)) {
        ops.push({
          kind: 'delete',
          scope: group.scope,
          name: currentMap.get(lower)!.name || originalName
        })
      }
    }
  } else {
    // Deactivating the group: delete all managed variables of this group that currently exist
    for (const [lower, originalName] of allManagedVarNames.entries()) {
      if (currentMap.has(lower)) {
        ops.push({
          kind: 'delete',
          scope: group.scope,
          name: currentMap.get(lower)!.name || originalName
        })
      }
    }
  }

  // Handle Path entries linked to candidates in this group
  const allGroupPathSet = new Set<string>()
  for (const cand of group.candidates) {
    for (const p of cand.pathEntries) {
      allGroupPathSet.add(normalizeWinPathForCompare(p))
    }
  }

  if (allGroupPathSet.size > 0) {
    const pathEntry = currentMap.get('path')
    const currentPathParts = splitPathEntries(pathEntry?.rawValue || '')
    const targetPaths = targetCandidate ? targetCandidate.pathEntries : []
    const targetNormSet = new Set(targetPaths.map(normalizeWinPathForCompare))

    // Remove path entries that belong exclusively to OTHER candidates in this group
    const nextParts: string[] = []
    const existingTargetNorms = new Set<string>()
    let replacedIndex = -1

    for (const part of currentPathParts) {
      const norm = normalizeWinPathForCompare(part)
      if (allGroupPathSet.has(norm) && !targetNormSet.has(norm)) {
        if (replacedIndex === -1) replacedIndex = nextParts.length
        continue
      }
      if (targetNormSet.has(norm)) {
        existingTargetNorms.add(norm)
      }
      nextParts.push(part)
    }

    const missingTargetEntries = targetPaths.filter(
      p => !existingTargetNorms.has(normalizeWinPathForCompare(p))
    )

    if (missingTargetEntries.length > 0) {
      if (replacedIndex >= 0 && replacedIndex <= nextParts.length) {
        nextParts.splice(replacedIndex, 0, ...missingTargetEntries)
      } else {
        nextParts.push(...missingTargetEntries)
      }
    }

    const nextPathRaw = joinPathEntries(nextParts)
    if (nextPathRaw !== (pathEntry?.rawValue || '')) {
      ops.push({
        kind: 'set',
        scope: group.scope,
        name: pathEntry?.name || 'Path',
        value: nextPathRaw,
        isExpand: Boolean(pathEntry?.isExpand || /%[^%]+%/.test(nextPathRaw))
      })
    }
  }

  return ops
}

export function computeSnapshotRestoreOperations(
  snapshot: EnvSnapshotDetail,
  currentState: EnvStateSnapshot
): EnvMutationOp[] {
  const ops: EnvMutationOp[] = []

  for (const scope of ['User', 'Machine'] as const) {
    const currentList = scope === 'Machine' ? currentState.machine : currentState.user
    const targetList = snapshot.items.filter(item => item.scope === scope)

    const currentMap = new Map<string, EnvEntry>()
    for (const item of currentList) currentMap.set(item.name.toLowerCase(), item)

    const targetMap = new Map<string, EnvSnapshotItem>()
    for (const item of targetList) targetMap.set(item.name.toLowerCase(), item)

    for (const [lower, target] of targetMap.entries()) {
      const existing = currentMap.get(lower)
      if (
        !existing ||
        existing.rawValue !== target.rawValue ||
        existing.isExpand !== target.isExpand ||
        existing.name !== target.name
      ) {
        ops.push({
          kind: 'set',
          scope,
          name: target.name,
          value: target.rawValue,
          isExpand: target.isExpand
        })
      }
    }

    for (const [lower, existing] of currentMap.entries()) {
      if (!targetMap.has(lower)) {
        ops.push({
          kind: 'delete',
          scope,
          name: existing.name
        })
      }
    }
  }

  return ops
}

export function pruneSnapshotsList(snapshots: EnvSnapshotDetail[]): EnvSnapshotDetail[] {
  const manuals = snapshots
    .filter(s => s.kind === 'manual')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_MANUAL_SNAPSHOTS)

  const autos = snapshots
    .filter(s => s.kind === 'auto')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_AUTO_SNAPSHOTS)

  return [...manuals, ...autos].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function toSummary(detail: EnvSnapshotDetail): EnvSnapshotSummary {
  const { items: _items, ...summary } = detail
  return summary
}

export class EnvManagerService {
  private busyCount = 0
  private cachedState: EnvStateSnapshot | null = null

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    this.busyCount++
    try {
      return await fn()
    } finally {
      this.busyCount--
    }
  }

  async dataMutation<T>(fn: () => Promise<T> | T): Promise<T> {
    if (this.busyCount > 0) {
      throw Error('正在执行系统环境变量变更或备份操作，请稍后再试')
    }
    return await fn()
  }

  async getState(): Promise<EnvStateSnapshot> {
    const state = await readWindowsEnvState()
    this.cachedState = state
    return state
  }

  async whereIs(query: string): Promise<WhereIsResult> {
    const state = this.cachedState ?? (await this.getState())
    return resolveWhereIsFromState(query, state)
  }

  private readAllSnapshots(): EnvSnapshotDetail[] {
    const list = readJsonSafe<EnvSnapshotDetail[]>(snapshotsFilePath(), [])
    return Array.isArray(list) ? list : []
  }

  private saveSnapshotRecord(
    state: EnvStateSnapshot,
    title: string,
    kind: 'auto' | 'manual'
  ): EnvSnapshotDetail {
    const items: EnvSnapshotItem[] = [
      ...state.user.map(e => ({
        scope: 'User' as const,
        name: e.name,
        rawValue: e.rawValue,
        isExpand: e.isExpand
      })),
      ...state.machine.map(e => ({
        scope: 'Machine' as const,
        name: e.name,
        rawValue: e.rawValue,
        isExpand: e.isExpand
      }))
    ]
    const detail: EnvSnapshotDetail = {
      id: randomUUID(),
      title: title.trim() || (kind === 'auto' ? '自动变更前快照' : '手动快照'),
      kind,
      createdAt: new Date().toISOString(),
      userCount: state.user.length,
      machineCount: state.machine.length,
      items
    }
    const existing = this.readAllSnapshots()
    const next = pruneSnapshotsList([detail, ...existing])
    writeJsonAtomic(snapshotsFilePath(), next)
    return detail
  }

  async applyChanges(rawInput: EnvApplyInput): Promise<EnvStateSnapshot> {
    const input = envApplyInputSchema.parse(rawInput)
    const guardErr = validateEnvOperationsGuardrails(input.operations)
    if (guardErr) throw Error(guardErr)

    return this.runExclusive(async () => {
      const beforeState = await readWindowsEnvState()
      this.saveSnapshotRecord(
        beforeState,
        input.reason || `修改环境变量 (${input.operations.length} 项)`,
        'auto'
      )
      await applyWindowsEnvOperations(input.operations, beforeState.isAdmin)
      const afterState = await readWindowsEnvState()
      this.cachedState = afterState
      return afterState
    })
  }

  listGroups(): EnvSwitchGroup[] {
    const list = readJsonSafe<EnvSwitchGroup[]>(profilesFilePath(), [])
    return Array.isArray(list) ? list : []
  }

  saveGroup(rawInput: EnvSwitchGroupInput): EnvSwitchGroup[] {
    const input = envSwitchGroupInputSchema.parse(rawInput)
    const groups = this.listGroups()
    const now = new Date().toISOString()
    const id = input.id || randomUUID()
    const nextItem: EnvSwitchGroup = {
      id,
      name: input.name.trim(),
      scope: input.scope,
      candidates: input.candidates.map(c => ({
        id: c.id || randomUUID(),
        name: c.name.trim(),
        variables: c.variables.map(v => ({
          name: v.name.trim(),
          value: v.value,
          isExpand: Boolean(v.isExpand || /%[^%]+%/.test(v.value))
        })),
        pathEntries: c.pathEntries.map(p => p.trim()).filter(Boolean)
      })),
      updatedAt: now
    }

    const idx = groups.findIndex(g => g.id === id)
    if (idx >= 0) {
      groups[idx] = nextItem
    } else {
      groups.push(nextItem)
    }
    writeJsonAtomic(profilesFilePath(), groups)
    return groups
  }

  removeGroup(id: string): EnvSwitchGroup[] {
    const groups = this.listGroups().filter(g => g.id !== id)
    writeJsonAtomic(profilesFilePath(), groups)
    return groups
  }

  async activateCandidate(groupId: string, candidateId: string | null): Promise<EnvStateSnapshot> {
    const group = this.listGroups().find(g => g.id === groupId)
    if (!group) throw Error('未找到对应的版本切换分组')

    return this.runExclusive(async () => {
      const beforeState = await readWindowsEnvState()
      const ops = computeGroupActivationOperations(group, candidateId, beforeState)
      if (ops.length === 0) {
        this.cachedState = beforeState
        return beforeState
      }
      const guardErr = validateEnvOperationsGuardrails(ops)
      if (guardErr) throw Error(guardErr)

      const candidateName = candidateId
        ? group.candidates.find(c => c.id === candidateId)?.name || candidateId
        : '停用'
      this.saveSnapshotRecord(beforeState, `切换预设 [${group.name}] -> ${candidateName}`, 'auto')
      await applyWindowsEnvOperations(ops, beforeState.isAdmin)
      const afterState = await readWindowsEnvState()
      this.cachedState = afterState
      return afterState
    })
  }

  listSnapshots(): EnvSnapshotSummary[] {
    return this.readAllSnapshots().map(toSummary)
  }

  getSnapshot(id: string): EnvSnapshotDetail {
    const found = this.readAllSnapshots().find(s => s.id === id)
    if (!found) throw Error('快照不存在或已被清理')
    return found
  }

  async createSnapshot(title: string): Promise<EnvSnapshotSummary[]> {
    const cleanTitle = title.trim().slice(0, 120) || '手动备份快照'
    return this.runExclusive(async () => {
      const state = await readWindowsEnvState()
      this.cachedState = state
      this.saveSnapshotRecord(state, cleanTitle, 'manual')
      return this.listSnapshots()
    })
  }

  removeSnapshot(id: string): EnvSnapshotSummary[] {
    const next = this.readAllSnapshots().filter(s => s.id !== id)
    writeJsonAtomic(snapshotsFilePath(), next)
    return next.map(toSummary)
  }

  async restoreSnapshot(id: string): Promise<EnvStateSnapshot> {
    const target = this.getSnapshot(id)
    return this.runExclusive(async () => {
      const beforeState = await readWindowsEnvState()
      const ops = computeSnapshotRestoreOperations(target, beforeState)
      if (ops.length === 0) {
        this.cachedState = beforeState
        return beforeState
      }
      const guardErr = validateEnvOperationsGuardrails(ops)
      if (guardErr) throw Error(guardErr)

      this.saveSnapshotRecord(beforeState, `回滚前自动保护快照（目标：${target.title}）`, 'auto')
      await applyWindowsEnvOperations(ops, beforeState.isAdmin)
      const afterState = await readWindowsEnvState()
      this.cachedState = afterState
      return afterState
    })
  }

  async exportSnapshot(win: BrowserWindow, id?: string): Promise<string | null> {
    let detail: EnvSnapshotDetail
    if (id) {
      detail = this.getSnapshot(id)
    } else {
      const state = await this.getState()
      detail = {
        id: randomUUID(),
        title: '当前系统环境变量导出',
        kind: 'manual',
        createdAt: new Date().toISOString(),
        userCount: state.user.length,
        machineCount: state.machine.length,
        items: [
          ...state.user.map(e => ({
            scope: 'User' as const,
            name: e.name,
            rawValue: e.rawValue,
            isExpand: e.isExpand
          })),
          ...state.machine.map(e => ({
            scope: 'Machine' as const,
            name: e.name,
            rawValue: e.rawValue,
            isExpand: e.isExpand
          }))
        ]
      }
    }

    const dateTag = new Date().toISOString().slice(0, 10)
    const picked = await dialog.showSaveDialog(win, {
      title: '导出环境变量快照备份',
      defaultPath: `ToolDock-EnvSnapshot-${dateTag}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (picked.canceled || !picked.filePath) return null

    const payload = {
      app: 'ToolDock-EnvSnapshot',
      version: 1,
      exportedAt: new Date().toISOString(),
      snapshot: detail,
      groups: this.listGroups()
    }
    fs.writeFileSync(picked.filePath, JSON.stringify(payload, null, 2), 'utf8')
    return picked.filePath
  }

  async importSnapshot(win: BrowserWindow): Promise<EnvSnapshotDetail | null> {
    const picked = await dialog.showOpenDialog(win, {
      title: '导入环境变量快照备份',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (picked.canceled || !picked.filePaths[0]) return null
    const rawText = fs.readFileSync(picked.filePaths[0], 'utf8')
    if (rawText.length > 10 * 1024 * 1024) throw Error('备份文件超出 10 MiB 大小限制')
    const parsed = JSON.parse(rawText) as {
      app?: string
      snapshot?: Partial<EnvSnapshotDetail>
      groups?: unknown[]
    }
    if (parsed.app !== 'ToolDock-EnvSnapshot' || !parsed.snapshot || !Array.isArray(parsed.snapshot.items)) {
      throw Error('无效的环境变量备份文件格式')
    }

    const validItems: EnvSnapshotItem[] = parsed.snapshot.items
      .filter(
        (x): x is EnvSnapshotItem =>
          Boolean(x) &&
          (x.scope === 'User' || x.scope === 'Machine') &&
          typeof x.name === 'string' &&
          x.name.trim().length > 0 &&
          typeof x.rawValue === 'string'
      )
      .map(x => ({
        scope: x.scope,
        name: x.name.trim(),
        rawValue: x.rawValue,
        isExpand: Boolean(x.isExpand)
      }))

    if (validItems.length === 0) throw Error('备份文件中没有有效的环境变量条目')

    const imported: EnvSnapshotDetail = {
      id: randomUUID(),
      title: `[导入] ${(parsed.snapshot.title || '外部备份').slice(0, 80)}`,
      kind: 'manual',
      createdAt: new Date().toISOString(),
      userCount: validItems.filter(i => i.scope === 'User').length,
      machineCount: validItems.filter(i => i.scope === 'Machine').length,
      items: validItems
    }

    const existing = this.readAllSnapshots()
    const next = pruneSnapshotsList([imported, ...existing])
    writeJsonAtomic(snapshotsFilePath(), next)

    // Also merge non-conflicting switch groups if present in backup
    if (Array.isArray(parsed.groups) && parsed.groups.length > 0) {
      const currentGroups = this.listGroups()
      const existingIds = new Set(currentGroups.map(g => g.id))
      let added = false
      for (const rawG of parsed.groups) {
        const res = envSwitchGroupInputSchema.safeParse(rawG)
        if (res.success && (!res.data.id || !existingIds.has(res.data.id))) {
          currentGroups.push({
            id: res.data.id || randomUUID(),
            name: res.data.name,
            scope: res.data.scope,
            candidates: res.data.candidates,
            updatedAt: new Date().toISOString()
          })
          added = true
        }
      }
      if (added) writeJsonAtomic(profilesFilePath(), currentGroups)
    }

    return imported
  }
}
