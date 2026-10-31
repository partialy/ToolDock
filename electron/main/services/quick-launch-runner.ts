import { app, safeStorage } from 'electron'
import { spawn } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import type { QuickLaunchApp, QuickLaunchEnvironment, QuickLaunchTask } from '../../../src/shared/quickLaunchModels'

interface Identity { id: string; runnerPid: number; runnerStart: string; image: string }
interface Metadata { version: 1; id: string; appId: string; appName: string; startedAt: string; silent: boolean; runAsAdmin: boolean; pipe: string; protectedToken: string; identity: Identity }
interface Reply { error?: string; code?: number; gone?: boolean; id?: string; status?: QuickLaunchTask['status']; pid?: number; childPids?: number[]; exitCode?: number | null; endedAt?: string; output?: string; truncated?: boolean; sequence?:number; identity?: Identity }
const locked = (task: QuickLaunchTask) => ['starting', 'running', 'unknown'].includes(task.status)
const findExecutable = (file: string) => {
  for (const directory of (process.env.PATH ?? '').split(';')) {
    const candidate = join(directory.replace(/^"|"$/g, ''), file)
    try { if (existsSync(candidate)) return realpathSync(candidate) } catch { /* Continue probing PATH. */ }
  }
  return null
}

/** Each task belongs to a detached native Runner; Electron never owns its Job handle. */
export class QuickLaunchRunner {
  private readonly records = new Map<string, QuickLaunchTask>()
  private readonly metadata = new Map<string, Metadata>()
  private readonly busy = new Set<string>()
  private timer?: ReturnType<typeof setInterval>
  private polling = false
  private initialized = false
  private windowsIdentity?: { sid: string; sessionId: number; elevated: boolean }
  private readonly helper: string
  private readonly executables: QuickLaunchEnvironment

  constructor(private readonly rootProvider: () => string, helperPath?: string, private readonly onChange: () => void = () => {}) {
    this.helper = helperPath ?? (app.isPackaged ? join(process.resourcesPath, 'quick-launch-runner', 'ToolDock.QuickLaunchRunner.exe') : resolve(app.getAppPath(), 'native/quick-launch-runner/publish/ToolDock.QuickLaunchRunner.exe'))
    const system = process.env.SystemRoot ?? 'C:\\Windows'
    const powershell = join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const cmd = join(system, 'System32', 'cmd.exe')
    this.executables = { windowsPowerShell: existsSync(powershell) ? powershell : null, cmd: existsSync(cmd) ? cmd : null, pwsh: findExecutable('pwsh.exe') }
  }
  environment(): QuickLaunchEnvironment { return { ...this.executables } }
  tasks(): QuickLaunchTask[] { return [...this.records.values()].map(task => ({ ...task, childPids: [...task.childPids], output: '' })) }
  hasActive(): boolean { return this.busy.size > 0 || [...this.records.values()].some(locked) }
  assertUnlocked(appId: string): void {
    if (this.busy.has(appId) || [...this.records.values()].some(task => locked(task) && (task.appId === appId || task.appId === 'unresolved-runtime'))) throw new Error('该 App 正在运行或存在无法识别的任务，请先停止或重新检测')
  }
  private runtime(): string { return join(this.rootProvider(), 'tools', 'quick-launch', 'runtime') }
  private metaPath(id: string): string { return join(this.runtime(), `${id}.json`) }
  private resultPath(id: string): string { return join(this.runtime(), `${id}.result`) }
  private async invoke(mode: string, input: unknown, timeout = 15000): Promise<Reply & Record<string, unknown>> {
    if (!existsSync(this.helper)) throw new Error('快捷启动 Runner 未构建，请先运行 npm run build:runner')
    return new Promise((accept, reject) => {
      // Configuration and authentication credentials travel only through a private stdin pipe.
      const child = spawn(this.helper, [mode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP, PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOMEDRIVE: process.env.HOMEDRIVE, HOMEPATH: process.env.HOMEPATH, COMSPEC: process.env.COMSPEC, LOCALAPPDATA: process.env.LOCALAPPDATA, APPDATA: process.env.APPDATA } })
      let output = '', settled = false
      const finish = (error?: Error, value?: Reply & Record<string, unknown>) => { if (settled) return; settled = true; clearTimeout(deadline); child.unref(); child.stdout.destroy(); child.stderr.destroy(); error ? reject(error) : accept(value!) }
      const deadline = setTimeout(() => { child.kill(); finish(new Error(mode === 'launch' ? '等待 UAC 或 Runner 启动超时，请重新检测任务状态' : 'Runner 未响应，任务身份需要重新检测')) }, timeout)
      child.stdout.setEncoding('utf8')
      const parse = () => {
        try {
          const reply = JSON.parse(output.trim()) as Reply & Record<string, unknown>
          if (reply.error) finish(new Error(reply.error === 'UAC_CANCELLED' ? '已取消 Windows 管理员授权' : `Runner 操作失败（系统错误 ${reply.code ?? 0}）`))
          else finish(undefined, reply)
        } catch { finish(new Error('Runner 返回无效响应')) }
      }
      child.stdout.on('data', (chunk: string) => { output += chunk; if (Buffer.byteLength(output) > 16 * 1024 * 1024) { child.kill(); finish(new Error('Runner 响应超过限制')) } else if (output.endsWith('\n')) parse() })
      child.stderr.resume()
      child.on('error', () => finish(new Error('无法启动快捷启动 Runner')))
      child.stdin.on('error', () => {})
      child.on('close', () => { if (!settled) parse() })
      child.stdin.end((typeof input === 'string' ? input : JSON.stringify(input)) + '\n')
    })
  }
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    if (process.platform !== 'win32') return
    try {
      for (const part of [join(this.rootProvider(), 'tools'), join(this.rootProvider(), 'tools', 'quick-launch'), this.runtime()]) {
        try { if ((await lstat(part)).isSymbolicLink()) throw new Error('运行目录不允许符号链接') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      }
      await mkdir(this.runtime(), { recursive: true })
      if (existsSync(this.helper)) {
        await this.invoke('protect', this.runtime())
        this.windowsIdentity = await this.invoke('environment', {}) as unknown as typeof this.windowsIdentity
      }
      await this.load()
    } catch { this.initialized = false; throw new Error('无法初始化快捷启动任务运行目录') }
    this.timer = setInterval(() => { void this.reconcile().catch(() => {}) }, 1500)
    this.timer.unref()
  }
  async reload(): Promise<void> {
    if (this.hasActive()) throw new Error('存在活动或未知任务，无法切换运行目录')
    this.dispose(); this.records.clear(); this.metadata.clear(); this.initialized = false; await this.initialize()
  }
  private async load(): Promise<void> {
    for (const file of await readdir(this.runtime())) {
      if (!/^[\da-f-]{36}\.json$/i.test(file)) continue
      try {
        if ((await stat(join(this.runtime(), file))).size > 65536) throw new Error()
        const metadata = JSON.parse(await readFile(join(this.runtime(), file), 'utf8')) as Metadata
        if (metadata.version !== 1 || metadata.id + '.json' !== file || !metadata.identity || !/^[\da-f-]{36}$/i.test(metadata.appId)) throw new Error()
        this.metadata.set(metadata.id, metadata)
        this.records.set(metadata.id, { id: metadata.id, appId: metadata.appId, appName: metadata.appName, startedAt: metadata.startedAt, silent: metadata.silent, runAsAdmin: metadata.runAsAdmin, status: 'unknown', commandSummary: '重新连接的已保存任务', output: '', truncated: false, childPids: [], runnerPid: metadata.identity.runnerPid, connectionNote: '仅显示本次连接后的输出' })
        await this.refresh(metadata.id, 'attach')
      } catch {
        const id = file.slice(0, -5)
        if (!this.records.has(id)) this.records.set(id, { id, appId: 'unresolved-runtime', appName: '无法识别的任务记录', startedAt: new Date().toISOString(), silent: true, runAsAdmin: false, status: 'unknown', commandSummary: '', output: '', truncated: false, childPids: [], reason: '运行元数据损坏，已阻止数据迁移；请检查或确认解除未知状态' })
      }
    }
  }
  private async persist(metadata: Metadata): Promise<void> {
    const temporary = this.metaPath(metadata.id) + '.tmp'
    await writeFile(temporary, JSON.stringify(metadata), { mode: 0o600, flag: 'wx' })
    await rename(temporary, this.metaPath(metadata.id))
  }
  async run(configuration: QuickLaunchApp, scriptPath: string | null): Promise<QuickLaunchTask> {
    this.assertUnlocked(configuration.id)
    if ([...this.records.values()].filter(locked).length >= 8) throw new Error('最多同时运行 8 个任务')
    this.busy.add(configuration.id)
    const id = randomUUID(), token = randomBytes(32).toString('hex'), pipe = `tooldock-quick-${id}`
    const task: QuickLaunchTask = { id, appId: configuration.id, appName: configuration.name, startedAt: new Date().toISOString(), silent: configuration.silent, runAsAdmin: configuration.runAsAdmin, status: 'starting', commandSummary: configuration.sourceKind === 'file' ? configuration.scriptName ?? '托管脚本' : configuration.inlineContent, output: '', truncated: false, childPids: [] }
    this.records.set(id, task); this.onChange()
    try {
      if (!this.windowsIdentity) { this.dispose(); this.initialized = false; await this.initialize() }
      if (!this.windowsIdentity || !safeStorage.isEncryptionAvailable()) throw new Error('Windows 运行身份或安全凭据存储不可用')
      if (this.windowsIdentity.elevated && !configuration.runAsAdmin) throw new Error('请以普通权限启动 ToolDock，避免普通任务继承管理员权限')
      const executable = configuration.shell === 'cmd' ? this.executables.cmd : configuration.psFlavor === 'pwsh' ? this.executables.pwsh : this.executables.windowsPowerShell
      if (!executable) throw new Error('所选命令解释器未安装')
      const workingDirectory = configuration.workingDirectory || (scriptPath ? dirname(scriptPath) : homedir())
      if (!isAbsolute(workingDirectory) || workingDirectory.startsWith('\\\\') || !(await stat(workingDirectory)).isDirectory()) throw new Error('工作目录必须是存在的本地绝对目录')
      if (!(await stat(executable)).isFile()) throw new Error('所选命令解释器不存在')
      if (configuration.sourceKind === 'file' && !scriptPath) throw new Error('托管脚本不存在')
      const pending: Metadata = { version: 1, id, appId: configuration.id, appName: configuration.name, startedAt: task.startedAt, silent: configuration.silent, runAsAdmin: configuration.runAsAdmin, pipe, protectedToken: safeStorage.encryptString(token).toString('base64'), identity: { id, runnerPid: 0, runnerStart: '0', image: this.helper } }
      await this.persist(pending); this.metadata.set(id, pending)
      const content = configuration.inlineContent
      const launch = await this.invoke('launch', { id, appId: configuration.id, token, pipe, ownerSid: this.windowsIdentity.sid, sessionId: this.windowsIdentity.sessionId, executable, shell: configuration.shell, scriptPath, content, workingDirectory, silent: configuration.silent, elevated: configuration.runAsAdmin, resultPath: this.resultPath(id), metadataPath: this.metaPath(id), metadataJson: JSON.stringify(pending) }, 105000)
      if (!launch.identity || launch.identity.id !== id) throw new Error('Runner 启动身份无效')
      const metadata: Metadata = { version: 1, id, appId: configuration.id, appName: configuration.name, startedAt: task.startedAt, silent: configuration.silent, runAsAdmin: configuration.runAsAdmin, pipe, protectedToken: safeStorage.encryptString(token).toString('base64'), identity: launch.identity }
      this.metadata.set(id, metadata); task.runnerPid = metadata.identity.runnerPid; task.pid = launch.pid
      try { await this.persist(metadata) } catch { await this.refresh(id, 'stop'); throw new Error('无法保存安全运行身份，已请求停止任务') }
      await this.refresh(id)
      return { ...task }
    } catch (error) {
      if (error instanceof Error && error.message === '已取消 Windows 管理员授权') { this.metadata.delete(id); await unlink(this.metaPath(id)).catch(() => {}) }
      task.status = this.metadata.has(id) ? 'unknown' : 'failed'; task.reason = error instanceof Error ? error.message : '启动失败'; if (task.status === 'failed') task.endedAt = new Date().toISOString(); throw error
    }
    finally { this.busy.delete(configuration.id); this.onChange() }
  }
  private async refresh(id: string, command = 'status'): Promise<void> {
    const metadata = this.metadata.get(id), task = this.records.get(id)
    if (!metadata || !task) return
    try {
      if (metadata.identity.runnerPid === 0) {
        const published = JSON.parse(await readFile(this.metaPath(id), 'utf8')) as Metadata
        if (published.id !== id || published.protectedToken !== metadata.protectedToken || published.identity.runnerPid < 1) throw new Error()
        metadata.identity = published.identity; task.runnerPid = published.identity.runnerPid
      }
      const token = safeStorage.decryptString(Buffer.from(metadata.protectedToken, 'base64'))
      const reply = await this.invoke('client', { identity: metadata.identity, token, pipe: metadata.pipe, command })
      if (reply.gone) {
        try {
          const signed = JSON.parse(await readFile(this.resultPath(id), 'utf8')) as {payload:string;proof:string}
          if (createHmac('sha256', Buffer.from(token, 'hex')).update(signed.payload).digest('hex').toUpperCase() !== signed.proof) throw new Error()
          const result = JSON.parse(signed.payload) as Reply & { runnerPid: number; runnerStart: string }
          if (result.id !== id || result.runnerPid !== metadata.identity.runnerPid || result.runnerStart !== metadata.identity.runnerStart) throw new Error()
          Object.assign(task, { status: result.status, exitCode: result.exitCode, endedAt: result.endedAt, childPids: [] })
        } catch { Object.assign(task, { status: 'unknown', reason: 'Runner 已退出，但缺少可验证的任务完成结果，请确认后解除未知状态' }) }
      } else {
        if (reply.id !== id || !['running', 'completed', 'failed'].includes(reply.status ?? '')) throw new Error()
        Object.assign(task, { status: reply.status, pid: reply.pid, childPids: reply.childPids ?? [], exitCode: reply.exitCode, endedAt: reply.endedAt ?? undefined, output: reply.output ?? '', truncated: reply.truncated ?? false, outputSequence:reply.sequence, reason: undefined })
      }
      if (!locked(task)) {
        this.metadata.delete(id); await unlink(this.metaPath(id)).catch(() => {}); await unlink(this.resultPath(id)).catch(() => {})
        const completed = [...this.records.values()].filter(item => !locked(item))
        for (const item of completed.slice(0, -8)) { item.output = ''; item.connectionNote = '较早任务的控制台输出已释放' }
        for (const item of completed.slice(0, -100)) this.records.delete(item.id)
      }
    } catch { task.status = 'unknown'; task.reason = 'Runner 无法连接或身份无法核实，请重新检测；不会按 PID 强制结束' }
  }
  async reconcile(): Promise<void> {
    if (this.polling) return
    this.polling = true
    const signature = () => [...this.records.values()].map(task => `${task.id}:${task.status}:${task.outputSequence}:${task.reason}:${task.exitCode}`).join('|')
    const before = signature()
    try { await Promise.all([...this.metadata.keys()].map(id => this.refresh(id))); if (signature() !== before) this.onChange() }
    finally { this.polling = false }
  }
  async task(id: string): Promise<QuickLaunchTask> {
    const task = this.records.get(id); if (!task) throw new Error('任务不存在')
    return { ...task, childPids: [...task.childPids] }
  }
  async stop(id: string): Promise<void> {
    const task = this.records.get(id); if (!task || !locked(task)) return
    if (!this.metadata.has(id)) throw new Error('任务身份无法核实')
    // Prevent concurrent status polling from consuming the one pipe instance during stop.
    while (this.polling) await new Promise(resolve => setTimeout(resolve, 25))
    this.polling = true
    try { await this.refresh(id, 'stop'); await this.refresh(id); if (locked(task)) throw new Error(task.reason ?? '任务尚未确认结束，请重新检测'); this.onChange() }
    finally { this.polling = false }
  }
  async clearUnknown(id: string): Promise<void> {
    const task = this.records.get(id); if (!task || task.status !== 'unknown') throw new Error('只有未知任务可以解除')
    this.metadata.delete(id); task.status = 'failed'; task.reason = '用户已解除未知状态；未结束任何无法核实的进程'; task.endedAt = new Date().toISOString()
    await unlink(this.metaPath(id)).catch(() => {}); await unlink(this.resultPath(id)).catch(() => {}); this.onChange()
  }
  async shutdown(stopOnExit: boolean): Promise<void> {
    if (this.timer) clearInterval(this.timer); this.timer = undefined
    if (stopOnExit) {
      let deadline: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.allSettled([...this.records.values()].filter(locked).map(task => this.stop(task.id))),
          new Promise<void>(resolve => { deadline = setTimeout(resolve, 20000) })
        ])
      } finally { if (deadline) clearTimeout(deadline) }
    }
  }
  dispose(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined }
}
