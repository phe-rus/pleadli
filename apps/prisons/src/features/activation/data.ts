import { api } from '@/lib/api'
import type { HqRole } from './schema'

/** `'facility'` persists immediately. `'head_office'` is not persisted by
 * this call at all: it only navigates the screen, and the role only becomes
 * `'head_office'` once `verifyActivationCode` succeeds. The node refuses
 * either once a role has been chosen. */
export async function chooseRole(role: HqRole) {
  await api('POST', '/api/system/onboarding/role', { body: { role } })
}

export async function verifyActivationCode(token: string) {
  await api('POST', '/api/system/onboarding/activate', { body: { token } })
}

/** Debug builds only: mints a validly signed activation code for testing,
 * without needing `www`'s not yet built generation flow. */
export async function mintDevActivationCode() {
  return (await api('GET', '/api/system/dev/activation-code')) as string
}
