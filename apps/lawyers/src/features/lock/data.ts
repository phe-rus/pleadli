import { api } from '@/lib/api'
import { lockStatusSchema, recoveryCodeSchema, type DisableInput, type RecoverInput, type SetupInput, type UnlockInput } from './schema'

export async function getLockStatus() {
  return lockStatusSchema.parse(await api('GET', '/api/lock/status'))
}

export async function setupLock(input: SetupInput) {
  return recoveryCodeSchema.parse(await api('POST', '/api/lock/setup', { body: input }))
}

export async function unlock(input: UnlockInput) {
  await api('POST', '/api/lock/unlock', { body: input })
}

export async function lockNow() {
  await api('POST', '/api/lock/lock')
}

export async function disableLock(input: DisableInput) {
  await api('POST', '/api/lock/disable', { body: input })
}

export async function recoverPin(input: RecoverInput) {
  return recoveryCodeSchema.parse(await api('POST', '/api/lock/recover', { body: input }))
}
