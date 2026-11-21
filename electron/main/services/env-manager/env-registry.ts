import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { app } from 'electron'
import {
  splitPathEntries,
  validateEnvOperationsGuardrails,
  whereIsQuerySchema,
  type EnvEntry,
  type EnvMutationOp,
  type EnvScope,
  type EnvStateSnapshot,
  type WhereIsHit,
  type WhereIsResult
} from '../../../../src/shared/envManagerModels'

const execFileAsync = promisify(execFile)

function ensureWindows() {
  if (process.platform !== 'win32') {
    throw Error('系统环境变量管理仅支持 Windows 10/11')
  }
}

const PS_HEADER = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);"

async function runPowerShellJson<T>(script: string, timeoutMs = 20000): Promise<T> {
  ensureWindows()
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PS_HEADER + '\n' + script],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        encoding: 'utf8'
      }
    )
    const text = stdout.trim()
    if (!text) throw Error('系统未返回环境变量数据')
    return JSON.parse(text) as T
  } catch (e) {
    const err = e as Error & { killed?: boolean; stderr?: string }
    if (err.killed) throw Error('系统环境变量操作超时，请稍后重试')
    if (e instanceof SyntaxError) throw Error('系统返回的环境变量数据无法解析')
    const detail = (err.stderr || err.message || '').trim()
    throw Error('Windows 环境变量操作失败：' + detail.slice(0, 500))
  }
}

type RawRegVar = {
  name: string
  rawValue: string
  expandedValue: string
  isExpand: boolean
}

type RawReadPayload = {
  isAdmin: boolean
  user: RawRegVar[]
  machine: RawRegVar[]
}

function normalizeEntries(scope: EnvScope, list: RawRegVar[]): EnvEntry[] {
  if (!Array.isArray(list)) return []
  return list
    .filter(item => item && typeof item.name === 'string' && item.name.trim().length > 0)
    .map(item => ({
      scope,
      name: String(item.name),
      rawValue: String(item.rawValue ?? ''),
      expandedValue: String(item.expandedValue ?? item.rawValue ?? ''),
      isExpand: Boolean(item.isExpand)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

export function checkDirectoriesExist(entries: EnvEntry[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const entry of entries) {
    if (entry.name.toLowerCase() !== 'path') continue
    const rawParts = splitPathEntries(entry.rawValue)
    for (const rawPart of rawParts) {
      const expanded = expandWithEntries(rawPart, entries)
      const cleaned = expanded.replace(/^"+|"+$/g, '').trim()
      if (!cleaned) continue
      if (!(cleaned in result)) {
        try {
          const stat = fs.statSync(cleaned, { throwIfNoEntry: false })
          result[cleaned] = Boolean(stat?.isDirectory())
        } catch {
          result[cleaned] = false
        }
      }
    }
  }
  return result
}

export function expandWithEntries(rawText: string, allEntries: EnvEntry[]): string {
  const lookup = new Map<string, string>()
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) lookup.set(k.toLowerCase(), v)
  }
  // Machine first, then User overrides (for non-Path variables)
  for (const item of allEntries) {
    if (item.scope === 'Machine') lookup.set(item.name.toLowerCase(), item.expandedValue || item.rawValue)
  }
  for (const item of allEntries) {
    if (item.scope === 'User') lookup.set(item.name.toLowerCase(), item.expandedValue || item.rawValue)
  }
  return rawText.replace(/%([^%]+)%/g, (full, varName: string) => {
    const found = lookup.get(varName.toLowerCase())
    return found !== undefined ? found : full
  })
}

export async function readWindowsEnvState(): Promise<EnvStateSnapshot> {
  const script = `
function Read-Scope($root, $subPath) {
  $list = [System.Collections.Generic.List[object]]::new()
  $key = $root.OpenSubKey($subPath, $false)
  if ($null -eq $key) { return $list }
  try {
    foreach ($name in $key.GetValueNames()) {
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      $raw = $key.GetValue($name, '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $kind = $key.GetValueKind($name)
      if ($kind -ne [Microsoft.Win32.RegistryValueKind]::String -and $kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) {
        continue
      }
      $rawStr = [string]$raw
      $expandedStr = [System.Environment]::ExpandEnvironmentVariables($rawStr)
      $list.Add([pscustomobject]@{
        name = [string]$name
        rawValue = $rawStr
        expandedValue = [string]$expandedStr
        isExpand = ($kind -eq [Microsoft.Win32.RegistryValueKind]::ExpandString)
      })
    }
  } finally {
    $key.Dispose()
  }
  return $list
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$userVars = @(Read-Scope ([Microsoft.Win32.Registry]::CurrentUser) 'Environment')
$machineVars = @(Read-Scope ([Microsoft.Win32.Registry]::LocalMachine) 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')

[pscustomobject]@{
  isAdmin = [bool]$isAdmin
  user = $userVars
  machine = $machineVars
} | ConvertTo-Json -Depth 5 -Compress
`
  const raw = await runPowerShellJson<RawReadPayload>(script)
  const user = normalizeEntries('User', raw.user)
  const machine = normalizeEntries('Machine', raw.machine)
  const all = [...machine, ...user]
  // Second-pass expansion using latest registry values so %JAVA_HOME%\bin reflects current registry JAVA_HOME
  for (const item of all) {
    if (item.rawValue.includes('%')) {
      item.expandedValue = expandWithEntries(item.rawValue, all)
    }
  }
  const pathDirectoriesExist = checkDirectoriesExist(all)
  return {
    isAdmin: Boolean(raw.isAdmin),
    user,
    machine,
    pathDirectoriesExist,
    fetchedAt: new Date().toISOString()
  }
}

const BROADCAST_CSHARP = `
if (-not ('ToolDock.Win32Env' -as [type])) {
  Add-Type -Namespace ToolDock -Name Win32Env -MemberDefinition @"
    [System.Runtime.InteropServices.DllImport("user32.dll", SetLastError = true, CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    public static extern System.IntPtr SendMessageTimeoutW(
      System.IntPtr hWnd,
      uint Msg,
      System.UIntPtr wParam,
      string lParam,
      uint fuFlags,
      uint uTimeout,
      out System.UIntPtr lpdwResult
    );
"@
}
$result = [System.UIntPtr]::Zero
[void][ToolDock.Win32Env]::SendMessageTimeoutW([System.IntPtr]0xffff, 0x001A, [System.UIntPtr]::Zero, 'Environment', 0x0002, 5000, [ref]$result)
`

const APPLY_OPS_PS_BODY = `
function Apply-EnvOperations($ops) {
  foreach ($op in $ops) {
    $isMachine = ([string]$op.scope -eq 'Machine')
    $root = if ($isMachine) { [Microsoft.Win32.Registry]::LocalMachine } else { [Microsoft.Win32.Registry]::CurrentUser }
    $subPath = if ($isMachine) { 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' } else { 'Environment' }
    $key = $root.OpenSubKey($subPath, $true)
    if ($null -eq $key) {
      throw "无法以写入模式打开注册表路径: $subPath"
    }
    try {
      $varName = [string]$op.name
      if ([string]$op.kind -eq 'delete') {
        $existing = $key.GetValue($varName, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($null -ne $existing) {
          $key.DeleteValue($varName, $false)
        }
      } elseif ([string]$op.kind -eq 'set') {
        $val = [string]$op.value
        $useExpand = [bool]$op.isExpand -or ($val -match '%[^%]+%')
        $regKind = if ($useExpand) { [Microsoft.Win32.RegistryValueKind]::ExpandString } else { [Microsoft.Win32.RegistryValueKind]::String }
        $key.SetValue($varName, $val, $regKind)
      }
    } finally {
      $key.Dispose()
    }
  }
}
`

export async function applyWindowsEnvOperations(
  operations: EnvMutationOp[],
  isCurrentlyAdmin: boolean
): Promise<void> {
  ensureWindows()
  if (operations.length === 0) return

  const guardError = validateEnvOperationsGuardrails(operations)
  if (guardError) throw Error(guardError)

  const userOps = operations.filter(op => op.scope === 'User')
  const machineOps = operations.filter(op => op.scope === 'Machine')

  // 1. Direct write for User ops (and Machine ops if already running as Admin)
  const directOps = isCurrentlyAdmin ? operations : userOps
  if (directOps.length > 0) {
    const encoded = Buffer.from(JSON.stringify(directOps), 'utf8').toString('base64')
    const script = `
${APPLY_OPS_PS_BODY}
$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encoded}'))
$ops = @(ConvertFrom-Json -InputObject $json)
Apply-EnvOperations $ops
${machineOps.length === 0 || isCurrentlyAdmin ? BROADCAST_CSHARP : ''}
[pscustomobject]@{ ok = $true } | ConvertTo-Json -Compress
`
    await runPowerShellJson<{ ok: boolean }>(script, 25000)
  }

  // 2. Elevated UAC write for Machine ops if not currently running as Admin
  if (machineOps.length > 0 && !isCurrentlyAdmin) {
    const tempDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'tooldock-env-uac-'))
    const payloadFile = path.join(tempDir, `payload-${randomUUID()}.json`)
    const statusFile = path.join(tempDir, `status-${randomUUID()}.json`)
    const workerScriptFile = path.join(tempDir, `worker-${randomUUID()}.ps1`)

    try {
      fs.writeFileSync(payloadFile, JSON.stringify(machineOps), { encoding: 'utf8', mode: 0o600 })
      const workerScript = `${PS_HEADER}
param([string]$PayloadPath, [string]$StatusPath)
${APPLY_OPS_PS_BODY}
try {
  $raw = [System.IO.File]::ReadAllText($PayloadPath, [System.Text.Encoding]::UTF8)
  $ops = @(ConvertFrom-Json -InputObject $raw)
  Apply-EnvOperations $ops
  ${BROADCAST_CSHARP}
  $out = [pscustomobject]@{ ok = $true; error = $null } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($StatusPath, $out, [System.Text.Encoding]::UTF8)
} catch {
  $out = [pscustomobject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  [System.IO.File]::WriteAllText($StatusPath, $out, [System.Text.Encoding]::UTF8)
  exit 1
}
`
      fs.writeFileSync(workerScriptFile, workerScript, { encoding: 'utf8', mode: 0o600 })

      const launcherEncoded = Buffer.from(
        JSON.stringify({ script: workerScriptFile, payload: payloadFile, status: statusFile }),
        'utf8'
      ).toString('base64')

      const launcherScript = `
$cfg = ConvertFrom-Json ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${launcherEncoded}')))
$argList = @(
  '-NoLogo',
  '-NoProfile',
  '-NonInteractive',
  '-ExecutionPolicy', 'Bypass',
  '-File', ('"' + $cfg.script + '"'),
  ('"' + $cfg.payload + '"'),
  ('"' + $cfg.status + '"')
)
try {
  $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ErrorAction Stop
  [pscustomobject]@{ started = $true; exitCode = [int]$proc.ExitCode } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ started = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`
      const launchRes = await runPowerShellJson<{ started: boolean; exitCode?: number; error?: string }>(
        launcherScript,
        60000
      )
      if (!launchRes.started) {
        throw Error('未授予管理员权限（UAC 已取消），系统环境变量未修改')
      }
      if (!fs.existsSync(statusFile)) {
        throw Error('管理员提权进程未返回执行状态，操作已中止')
      }
      const status = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as { ok: boolean; error?: string }
      if (!status.ok) {
        throw Error(status.error || '写入系统环境变量失败')
      }
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {
        // Ignore cleanup failures on temp folder
      }
    }
  }
}

export function resolveWhereIsFromState(queryInput: string, state: EnvStateSnapshot): WhereIsResult {
  const start = Date.now()
  const query = whereIsQuerySchema.parse(queryInput)
  const allEntries = [...state.machine, ...state.user]

  const machinePathEntry = state.machine.find(e => e.name.toLowerCase() === 'path')
  const userPathEntry = state.user.find(e => e.name.toLowerCase() === 'path')
  const pathExtEntry =
    state.user.find(e => e.name.toLowerCase() === 'pathext') ||
    state.machine.find(e => e.name.toLowerCase() === 'pathext')

  const rawExts = splitPathEntries(pathExtEntry?.expandedValue || process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
  const exts = rawExts.map(x => (x.startsWith('.') ? x.toLowerCase() : '.' + x.toLowerCase()))

  const hasExplicitExt = path.extname(query).length > 0
  const candidateNames = hasExplicitExt
    ? [query]
    : [query, ...exts.map(ext => query + ext)]

  const searchDirs: { scope: EnvScope; dir: string }[] = []
  for (const raw of splitPathEntries(machinePathEntry?.rawValue || '')) {
    const expanded = expandWithEntries(raw, allEntries).replace(/^"+|"+$/g, '').trim()
    if (expanded) searchDirs.push({ scope: 'Machine', dir: expanded })
  }
  for (const raw of splitPathEntries(userPathEntry?.rawValue || '')) {
    const expanded = expandWithEntries(raw, allEntries).replace(/^"+|"+$/g, '').trim()
    if (expanded) searchDirs.push({ scope: 'User', dir: expanded })
  }

  const hits: WhereIsHit[] = []
  const seenFiles = new Set<string>()

  for (const { scope, dir } of searchDirs) {
    for (const fileName of candidateNames) {
      const fullPath = path.join(dir, fileName)
      const normKey = fullPath.toLowerCase()
      if (seenFiles.has(normKey)) continue
      try {
        const stat = fs.statSync(fullPath, { throwIfNoEntry: false })
        if (stat && stat.isFile()) {
          seenFiles.add(normKey)
          const rank = hits.length + 1
          hits.push({
            rank,
            command: path.basename(fullPath),
            fullPath,
            directory: dir,
            scope,
            sizeBytes: stat.size,
            modifiedAt: stat.mtime.toISOString(),
            active: rank === 1
          })
        }
      } catch {
        // Ignore inaccessible paths
      }
    }
  }

  return {
    query,
    hits,
    durationMs: Date.now() - start
  }
}
