import { z } from 'zod'

export const envScopeSchema = z.enum(['User', 'Machine'])
export type EnvScope = z.infer<typeof envScopeSchema>

export const envVarNameSchema = z.string().trim().min(1, '变量名不能为空').max(255, '变量名过长').refine(
  name => !/[=\x00-\x1f]/.test(name),
  '变量名不能包含等号或控制字符'
)

export const envVarValueSchema = z.string().max(32767, '变量值超出 Windows 32767 字符上限').refine(
  val => !/\x00/.test(val),
  '变量值不能包含空字符'
)

export type EnvEntry = {
  scope: EnvScope
  name: string
  rawValue: string
  expandedValue: string
  isExpand: boolean
}

export type EnvPathEntryStatus = {
  raw: string
  expanded: string
  exists: boolean
  hasVarRef: boolean
  duplicateInScope: boolean
  duplicateCrossScope: boolean
}

export type EnvStateSnapshot = {
  isAdmin: boolean
  user: EnvEntry[]
  machine: EnvEntry[]
  pathDirectoriesExist: Record<string, boolean>
  fetchedAt: string
}

export const envMutationOpSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('set'),
    scope: envScopeSchema,
    name: envVarNameSchema,
    value: envVarValueSchema,
    isExpand: z.boolean()
  }),
  z.strictObject({
    kind: z.literal('delete'),
    scope: envScopeSchema,
    name: envVarNameSchema
  })
])

export type EnvMutationOp = z.infer<typeof envMutationOpSchema>

export const envApplyInputSchema = z.strictObject({
  operations: z.array(envMutationOpSchema).min(1).max(500),
  reason: z.string().trim().min(1).max(160).optional()
})

export type EnvApplyInput = z.infer<typeof envApplyInputSchema>

export const envSwitchVarSchema = z.strictObject({
  name: envVarNameSchema,
  value: envVarValueSchema,
  isExpand: z.boolean()
})

export const envSwitchCandidateSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1, '候选方案名称不能为空').max(80),
  variables: z.array(envSwitchVarSchema).max(50),
  pathEntries: z.array(z.string().trim().min(1).max(1024)).max(50)
})

export type EnvSwitchCandidate = z.infer<typeof envSwitchCandidateSchema>

export const envSwitchGroupInputSchema = z.strictObject({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1, '分组名称不能为空').max(80),
  scope: envScopeSchema,
  candidates: z.array(envSwitchCandidateSchema).min(1, '至少需要一个候选方案').max(30)
})

export type EnvSwitchGroupInput = z.infer<typeof envSwitchGroupInputSchema>

export type EnvSwitchGroup = {
  id: string
  name: string
  scope: EnvScope
  candidates: EnvSwitchCandidate[]
  updatedAt: string
}

export type EnvSnapshotItem = {
  scope: EnvScope
  name: string
  rawValue: string
  isExpand: boolean
}

export type EnvSnapshotSummary = {
  id: string
  title: string
  kind: 'auto' | 'manual'
  createdAt: string
  userCount: number
  machineCount: number
}

export type EnvSnapshotDetail = EnvSnapshotSummary & {
  items: EnvSnapshotItem[]
}

export const whereIsQuerySchema = z.string().trim().min(1).max(120).refine(
  cmd => !/[\\/:*?"<>|\x00-\x1f]/.test(cmd),
  '请输入命令名称（不要包含路径分隔符或特殊通配符）'
)

export type WhereIsHit = {
  rank: number
  command: string
  fullPath: string
  directory: string
  scope: EnvScope
  sizeBytes: number
  modifiedAt: string
  active: boolean
}

export type WhereIsResult = {
  query: string
  hits: WhereIsHit[]
  durationMs: number
}

export interface EnvManagerAPI {
  getState(): Promise<EnvStateSnapshot>
  applyChanges(input: EnvApplyInput): Promise<EnvStateSnapshot>
  whereIs(query: string): Promise<WhereIsResult>
  listGroups(): Promise<EnvSwitchGroup[]>
  saveGroup(input: EnvSwitchGroupInput): Promise<EnvSwitchGroup[]>
  removeGroup(id: string): Promise<EnvSwitchGroup[]>
  activateCandidate(groupId: string, candidateId: string | null): Promise<EnvStateSnapshot>
  listSnapshots(): Promise<EnvSnapshotSummary[]>
  getSnapshot(id: string): Promise<EnvSnapshotDetail>
  createSnapshot(title: string): Promise<EnvSnapshotSummary[]>
  removeSnapshot(id: string): Promise<EnvSnapshotSummary[]>
  restoreSnapshot(id: string): Promise<EnvStateSnapshot>
  exportSnapshot(id?: string): Promise<string | null>
  importSnapshot(): Promise<EnvSnapshotDetail | null>
}

/** 系统核心受保护变量（禁止删除或设为空值） */
export const PROTECTED_MACHINE_VARS = new Set([
  'comspec',
  'systemroot',
  'windir',
  'os',
  'processor_architecture',
  'psmodulepath',
  'pathext',
  'temp',
  'tmp'
])

export const SENSITIVE_NAME_PATTERN = /(?:api[_-]?key|secret|token|password|passwd|credential|private[_-]?key|access[_-]?key|auth)/i

export function isSensitiveVarName(name: string): boolean {
  return SENSITIVE_NAME_PATTERN.test(name)
}

export function isProtectedMachineVar(scope: EnvScope, name: string): boolean {
  return scope === 'Machine' && PROTECTED_MACHINE_VARS.has(name.trim().toLowerCase())
}

export function splitPathEntries(rawValue: string): string[] {
  if (!rawValue.trim()) return []
  return rawValue
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
}

export function joinPathEntries(entries: string[]): string {
  return entries.map(s => s.trim()).filter(Boolean).join(';')
}

export function normalizeWinPathForCompare(p: string): string {
  const trimmed = p.trim().replace(/^"+|"+$/g, '').replace(/\//g, '\\')
  if (/^[a-zA-Z]:\\$/.test(trimmed)) return trimmed.toLowerCase()
  return trimmed.replace(/\\+$/, '').toLowerCase()
}

export function deduplicatePathEntries(entries: string[]): { result: string[]; removedCount: number } {
  const seen = new Set<string>()
  const result: string[] = []
  let removedCount = 0
  for (const item of entries) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const key = normalizeWinPathForCompare(trimmed)
    if (seen.has(key)) {
      removedCount++
    } else {
      seen.add(key)
      result.push(trimmed)
    }
  }
  return { result, removedCount }
}

export function hasSystem32InPath(rawPath: string): boolean {
  const items = splitPathEntries(rawPath).map(normalizeWinPathForCompare)
  return items.some(
    p =>
      p === '%systemroot%\\system32' ||
      p === '%windir%\\system32' ||
      p.endsWith(':\\windows\\system32')
  )
}

/** 校验变更操作是否违反系统关键环境变量安全护栏 */
export function validateEnvOperationsGuardrails(operations: EnvMutationOp[]): string | null {
  for (const op of operations) {
    const lower = op.name.trim().toLowerCase()
    if (op.scope === 'Machine') {
      if (op.kind === 'delete') {
        if (lower === 'path') return '禁止删除系统级 Path 变量'
        if (PROTECTED_MACHINE_VARS.has(lower)) {
          return `系统核心变量 "${op.name}" 受保护，禁止删除`
        }
      } else if (op.kind === 'set') {
        if (lower === 'path') {
          if (!op.value.trim()) return '禁止清空系统级 Path 变量'
          if (!hasSystem32InPath(op.value)) {
            return '系统级 Path 必须保留 %SystemRoot%\\system32（或 C:\\Windows\\System32），防止系统基础命令瘫痪'
          }
        }
        if (PROTECTED_MACHINE_VARS.has(lower) && !op.value.trim()) {
          return `系统核心变量 "${op.name}" 不能为空`
        }
      }
    }
  }
  return null
}

/** 判断某候选方案是否与当前作用域的环境变量和 Path 匹配激活 */
export function detectActiveCandidateId(
  group: EnvSwitchGroup,
  scopeEntries: EnvEntry[]
): string | null {
  const map = new Map<string, string>()
  let pathRaw = ''
  for (const entry of scopeEntries) {
    map.set(entry.name.toLowerCase(), entry.rawValue)
    if (entry.name.toLowerCase() === 'path') pathRaw = entry.rawValue
  }
  const pathSet = new Set(splitPathEntries(pathRaw).map(normalizeWinPathForCompare))

  for (const candidate of group.candidates) {
    if (candidate.variables.length === 0 && candidate.pathEntries.length === 0) continue
    const varsMatch = candidate.variables.every(v => {
      const current = map.get(v.name.toLowerCase())
      if (current === undefined) return false
      return normalizeWinPathForCompare(current) === normalizeWinPathForCompare(v.value) || current === v.value
    })
    if (!varsMatch) continue
    const pathsMatch = candidate.pathEntries.every(p => pathSet.has(normalizeWinPathForCompare(p)))
    if (pathsMatch) return candidate.id
  }
  return null
}
