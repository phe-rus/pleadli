import { invoke, isTauri } from '@tauri-apps/api/core'
import { activationErrorSchema, ActivationError, type HqRole } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const parsed = activationErrorSchema.safeParse(body)
    throw parsed.success ? new ActivationError(parsed.data) : new Error(await response.text().catch(() => response.statusText))
  }
  return response.status === 204 ? null : response.json()
}

async function invokeActivation<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (raw) {
    const parsed = activationErrorSchema.safeParse(raw)
    throw parsed.success ? new ActivationError(parsed.data) : raw
  }
}

/** `'facility'` persists immediately. `'head_office'` is not persisted by
 * this call at all, it only navigates the screen, the role only actually
 * becomes `'head_office'` once `verifyActivationCode` succeeds. */
export async function chooseRole(role: HqRole) {
  if (isTauri()) {
    await invoke('choose_role', { role })
    return
  }
  await devFetch('/activation/role', { method: 'POST', body: JSON.stringify({ role }) })
}

export async function verifyActivationCode(token: string) {
  if (isTauri()) {
    await invokeActivation('verify_activation_code', { token })
    return
  }
  await devFetch('/activation/verify', { method: 'POST', body: JSON.stringify({ token }) })
}

/** Dev builds only: mints a validly signed activation code for testing,
 * without needing `www`'s not yet built generation flow. */
export async function mintDevActivationCode() {
  return isTauri() ? await invoke<string>('mint_dev_activation_code') : ((await devFetch('/activation/mint-dev-code')) as string)
}
