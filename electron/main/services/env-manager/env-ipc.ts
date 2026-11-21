import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import {
  envApplyInputSchema,
  envSwitchGroupInputSchema,
  whereIsQuerySchema
} from '../../../../src/shared/envManagerModels'
import type { EnvManagerService } from './env-storage'

type RegisterFn = <T>(channel: string, fn: (arg: T) => unknown | Promise<unknown>) => void

const idSchema = z.string().min(1).max(80)

export function registerEnvManagerIpc(
  register: RegisterFn,
  service: EnvManagerService,
  getWin: () => BrowserWindow | null
) {
  register('envManager:getState', () => service.getState())
  register('envManager:applyChanges', (a: unknown) => service.applyChanges(envApplyInputSchema.parse(a)))
  register('envManager:whereIs', (a: unknown) => service.whereIs(whereIsQuerySchema.parse(a)))
  register('envManager:listGroups', () => service.listGroups())
  register('envManager:saveGroup', (a: unknown) => service.saveGroup(envSwitchGroupInputSchema.parse(a)))
  register('envManager:removeGroup', (a: unknown) => service.removeGroup(idSchema.parse(a)))
  register('envManager:activateCandidate', (a: unknown) => {
    const v = z.strictObject({
      groupId: idSchema,
      candidateId: idSchema.nullable()
    }).parse(a)
    return service.activateCandidate(v.groupId, v.candidateId)
  })
  register('envManager:listSnapshots', () => service.listSnapshots())
  register('envManager:getSnapshot', (a: unknown) => service.getSnapshot(idSchema.parse(a)))
  register('envManager:createSnapshot', (a: unknown) => service.createSnapshot(z.string().max(120).parse(a)))
  register('envManager:removeSnapshot', (a: unknown) => service.removeSnapshot(idSchema.parse(a)))
  register('envManager:restoreSnapshot', (a: unknown) => service.restoreSnapshot(idSchema.parse(a)))
  register('envManager:exportSnapshot', (a: unknown) => {
    const win = getWin()
    if (!win) throw Error('主窗口不可用')
    const id = a === undefined || a === null ? undefined : idSchema.parse(a)
    return service.exportSnapshot(win, id)
  })
  register('envManager:importSnapshot', () => {
    const win = getWin()
    if (!win) throw Error('主窗口不可用')
    return service.importSnapshot(win)
  })
}
