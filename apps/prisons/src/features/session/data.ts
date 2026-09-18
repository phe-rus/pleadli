import { invoke, isTauri } from '@tauri-apps/api/core'
import { officerErrorSchema, officerSchema, OfficerError } from '@/features/officers'
import { hqConfigSchema, hqSessionSchema } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = officerErrorSchema.safeParse(body)
    throw parsed.success ? new OfficerError(parsed.data) : new Error(await response.text().catch(() => response.statusText))
  }
  return response.status === 204 ? null : response.json()
}

async function invokeOfficer<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (raw) {
    const parsed = officerErrorSchema.safeParse(raw)
    throw parsed.success ? new OfficerError(parsed.data) : raw
  }
}

export async function getHqConfig() {
  const config = isTauri() ? await invoke('get_hq_config') : await devFetch('/hq/config')
  return hqConfigSchema.parse(config)
}

export async function hqLogin(badgeNumber: string, password: string) {
  const officer = isTauri()
    ? await invokeOfficer('hq_login', { badgeNumber, password })
    : await devFetch('/hq/login', { method: 'POST', body: JSON.stringify({ badgeNumber, password }) })
  return officerSchema.parse(officer)
}

export async function getCurrentHqSession() {
  const officer = isTauri() ? await invoke('get_current_hq_session') : await devFetch('/hq/session')
  return hqSessionSchema.parse(officer)
}

export async function hqSignOut() {
  if (isTauri()) {
    await invoke('hq_sign_out')
    return
  }
  await devFetch('/hq/sign-out', { method: 'POST' })
}

/** Dev builds only: flips `is_head_office` and the matching `role`
 * together, compiled out of the underlying command's body in a release
 * build (see `commands::session::set_dev_role`), not just hidden in the UI. */
export async function setDevRole(isHeadOffice: boolean) {
  if (isTauri()) {
    await invoke('set_dev_role', { isHeadOffice })
    return
  }
  await devFetch('/hq/dev-role', { method: 'POST', body: JSON.stringify({ isHeadOffice }) })
}
