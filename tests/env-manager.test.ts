import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.TOOLDOCK_TEST_USERDATA || '', getAppMetrics: () => [] },
  dialog: { showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }
}))

import {
  closeStore,
  getDb,
  initStore,
  listCategories,
  listTools,
  removeCategory,
  saveTool
} from '../electron/main/database/store'
import { validateDataArchive } from '../electron/main/services/data-archive'
import {
  expandWithEntries,
  resolveWhereIsFromState
} from '../electron/main/services/env-manager/env-registry'
import {
  computeGroupActivationOperations,
  computeSnapshotRestoreOperations,
  pruneSnapshotsList
} from '../electron/main/services/env-manager/env-storage'
import {
  deduplicatePathEntries,
  detectActiveCandidateId,
  isProtectedMachineVar,
  isSensitiveVarName,
  splitPathEntries,
  validateEnvOperationsGuardrails,
  type EnvEntry,
  type EnvSnapshotDetail,
  type EnvStateSnapshot,
  type EnvSwitchGroup
} from '../src/shared/envManagerModels'

let dir = ''
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tooldock-env-manager-'))
  process.env.TOOLDOCK_TEST_USERDATA = dir
  initStore()
})
afterEach(() => {
  closeStore()
  delete process.env.TOOLDOCK_TEST_USERDATA
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('系统环境变量工具 SQLite v15 增量注册与备份隔离', () => {
  it('幂等注册 builtin-env-manager，保留用户自定义名称、分类和可见性', () => {
    const id = 'builtin-env-manager'
    const original = listTools().find(t => t.id === id)!
    expect(original).toMatchObject({
      categoryId: 'developer',
      target: 'env-manager',
      isBuiltin: true
    })
    expect(getDb().prepare('SELECT 1 FROM schema_migrations WHERE version=15').get()).toBeTruthy()

    saveTool({ ...original, name: '我的环境变量', icon: 'terminal', categoryId: 'default', visible: false })
    closeStore()
    initStore()
    const saved = listTools().filter(t => t.id === id)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({
      name: '我的环境变量',
      icon: 'terminal',
      categoryId: 'default',
      visible: false
    })
  })

  it('删除 developer 分类后迁移归入 default，不复活已删除分类', () => {
    removeCategory('developer')
    getDb().prepare("DELETE FROM tools WHERE id='builtin-env-manager'").run()
    getDb().prepare('DELETE FROM schema_migrations WHERE version=15').run()
    closeStore()
    initStore()
    expect(listCategories().find(x => x.id === 'developer')).toBeUndefined()
    expect(listTools().find(x => x.id === 'builtin-env-manager')?.categoryId).toBe('default')
  })

  it('普通 ZIP 备份校验拒绝包含 tools/env-manager 敏感快照目录', () => {
    const fakeEntries = [
      { entryName: 'manifest.json', isDirectory: false, attr: 0, header: { size: 50 } },
      { entryName: 'tooldock.sqlite', isDirectory: false, attr: 0, header: { size: 1024 } },
      { entryName: 'tools/env-manager/snapshots.json', isDirectory: false, attr: 0, header: { size: 200 } }
    ] as never
    expect(() => validateDataArchive(fakeEntries)).toThrow('不允许恢复的文件')
  })
})

describe('系统核心变量护栏与敏感名称识别', () => {
  it('拦截删除或清空系统核心变量及移除 System32', () => {
    expect(isProtectedMachineVar('Machine', 'ComSpec')).toBe(true)
    expect(isProtectedMachineVar('User', 'ComSpec')).toBe(false)

    expect(
      validateEnvOperationsGuardrails([{ kind: 'delete', scope: 'Machine', name: 'SystemRoot' }])
    ).toContain('受保护')

    expect(
      validateEnvOperationsGuardrails([{ kind: 'delete', scope: 'Machine', name: 'Path' }])
    ).toContain('禁止删除系统级 Path')

    expect(
      validateEnvOperationsGuardrails([
        { kind: 'set', scope: 'Machine', name: 'Path', value: 'D:\\Custom\\bin', isExpand: false }
      ])
    ).toContain('system32')

    expect(
      validateEnvOperationsGuardrails([
        {
          kind: 'set',
          scope: 'Machine',
          name: 'Path',
          value: '%SystemRoot%\\system32;D:\\Custom\\bin',
          isExpand: true
        }
      ])
    ).toBeNull()
  })

  it('识别敏感变量名与 Path 去重', () => {
    expect(isSensitiveVarName('OPENAI_API_KEY')).toBe(true)
    expect(isSensitiveVarName('GITHUB_TOKEN')).toBe(true)
    expect(isSensitiveVarName('JAVA_HOME')).toBe(false)

    const { result, removedCount } = deduplicatePathEntries([
      'C:\\Windows\\System32\\',
      'c:/windows/system32',
      'D:\\jdk-21\\bin'
    ])
    expect(removedCount).toBe(1)
    expect(result).toEqual(['C:\\Windows\\System32\\', 'D:\\jdk-21\\bin'])
  })
})

describe('版本切换组激活计算与快照回滚', () => {
  const sampleGroup: EnvSwitchGroup = {
    id: 'g-java',
    name: 'Java 版本',
    scope: 'User',
    updatedAt: '2026-11-11T00:00:00.000Z',
    candidates: [
      {
        id: 'c-jdk17',
        name: 'JDK 17',
        variables: [{ name: 'JAVA_HOME', value: 'D:\\jdk-17', isExpand: false }],
        pathEntries: ['D:\\jdk-17\\bin']
      },
      {
        id: 'c-jdk21',
        name: 'JDK 21',
        variables: [{ name: 'JAVA_HOME', value: 'D:\\jdk-21', isExpand: false }],
        pathEntries: ['D:\\jdk-21\\bin']
      }
    ]
  }

  const baseState: EnvStateSnapshot = {
    isAdmin: false,
    fetchedAt: '2026-11-11T00:00:00.000Z',
    pathDirectoriesExist: {},
    user: [
      {
        scope: 'User',
        name: 'JAVA_HOME',
        rawValue: 'D:\\jdk-17',
        expandedValue: 'D:\\jdk-17',
        isExpand: false
      },
      {
        scope: 'User',
        name: 'Path',
        rawValue: 'C:\\Users\\Test\\bin;D:\\jdk-17\\bin;C:\\Tools',
        expandedValue: 'C:\\Users\\Test\\bin;D:\\jdk-17\\bin;C:\\Tools',
        isExpand: false
      }
    ],
    machine: [
      {
        scope: 'Machine',
        name: 'Path',
        rawValue: '%SystemRoot%\\system32',
        expandedValue: 'C:\\Windows\\system32',
        isExpand: true
      }
    ]
  }

  it('正确识别已激活方案，并在切换时原位替换关联 Path 条目', () => {
    expect(detectActiveCandidateId(sampleGroup, baseState.user)).toBe('c-jdk17')

    const opsTo21 = computeGroupActivationOperations(sampleGroup, 'c-jdk21', baseState)
    expect(opsTo21).toEqual([
      { kind: 'set', scope: 'User', name: 'JAVA_HOME', value: 'D:\\jdk-21', isExpand: false },
      {
        kind: 'set',
        scope: 'User',
        name: 'Path',
        value: 'C:\\Users\\Test\\bin;D:\\jdk-21\\bin;C:\\Tools',
        isExpand: false
      }
    ])

    const opsDeactivate = computeGroupActivationOperations(sampleGroup, null, baseState)
    expect(opsDeactivate).toEqual([
      { kind: 'delete', scope: 'User', name: 'JAVA_HOME' },
      {
        kind: 'set',
        scope: 'User',
        name: 'Path',
        value: 'C:\\Users\\Test\\bin;C:\\Tools',
        isExpand: false
      }
    ])
  })

  it('计算快照回滚差异并限制自动快照数量上限', () => {
    const snap: EnvSnapshotDetail = {
      id: 's1',
      title: '初始快照',
      kind: 'manual',
      createdAt: '2026-11-11T00:00:00.000Z',
      userCount: 1,
      machineCount: 1,
      items: [
        { scope: 'User', name: 'Path', rawValue: 'C:\\Users\\Test\\bin', isExpand: false },
        { scope: 'Machine', name: 'Path', rawValue: '%SystemRoot%\\system32', isExpand: true }
      ]
    }
    const restoreOps = computeSnapshotRestoreOperations(snap, baseState)
    expect(restoreOps).toEqual([
      { kind: 'set', scope: 'User', name: 'Path', value: 'C:\\Users\\Test\\bin', isExpand: false },
      { kind: 'delete', scope: 'User', name: 'JAVA_HOME' }
    ])

    const manyAutos: EnvSnapshotDetail[] = Array.from({ length: 35 }, (_, i) => ({
      ...snap,
      id: `auto-${i}`,
      kind: 'auto',
      createdAt: new Date(Date.now() + i * 1000).toISOString()
    }))
    const pruned = pruneSnapshotsList(manyAutos)
    expect(pruned).toHaveLength(30)
  })

  it('Where-is 按系统 Path -> 用户 Path 顺序定位可执行文件并标注遮蔽关系', () => {
    const sysBin = path.join(dir, 'sys-bin')
    const userBin = path.join(dir, 'user-bin')
    fs.mkdirSync(sysBin, { recursive: true })
    fs.mkdirSync(userBin, { recursive: true })
    const exeSys = path.join(sysBin, 'demo-tool.cmd')
    const exeUser = path.join(userBin, 'demo-tool.cmd')
    fs.writeFileSync(exeSys, '@echo off\r\n')
    fs.writeFileSync(exeUser, '@echo off\r\n')

    const customState: EnvStateSnapshot = {
      isAdmin: false,
      fetchedAt: new Date().toISOString(),
      pathDirectoriesExist: {},
      machine: [
        { scope: 'Machine', name: 'Path', rawValue: sysBin, expandedValue: sysBin, isExpand: false },
        { scope: 'Machine', name: 'PATHEXT', rawValue: '.COM;.EXE;.BAT;.CMD', expandedValue: '.COM;.EXE;.BAT;.CMD', isExpand: false }
      ],
      user: [
        { scope: 'User', name: 'DEMO_HOME', rawValue: userBin, expandedValue: userBin, isExpand: false },
        { scope: 'User', name: 'Path', rawValue: '%DEMO_HOME%', expandedValue: userBin, isExpand: true }
      ]
    }

    const all: EnvEntry[] = [...customState.machine, ...customState.user]
    expect(expandWithEntries('%DEMO_HOME%\\sub', all)).toBe(`${userBin}\\sub`)
    expect(splitPathEntries('a;b;')).toEqual(['a', 'b'])

    const whereRes = resolveWhereIsFromState('demo-tool', customState)
    expect(whereRes.hits).toHaveLength(2)
    expect(whereRes.hits[0]).toMatchObject({
      rank: 1,
      scope: 'Machine',
      fullPath: exeSys,
      active: true
    })
    expect(whereRes.hits[1]).toMatchObject({
      rank: 2,
      scope: 'User',
      fullPath: exeUser,
      active: false
    })
  })
})
