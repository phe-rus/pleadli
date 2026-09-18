import { api, setSessionToken } from '@/lib/api'
import { bootstrapSchema, sessionSchema, signInResultSchema, systemStateSchema, type BootstrapInput } from './schema'

export async function getSystemState() {
  return systemStateSchema.parse(await api('GET', '/api/system/state'))
}

/** Verifies the credentials on the node and keeps the returned session
 * token for every later call. */
export async function signIn(badgeNumber: string, password: string) {
  const result = signInResultSchema.parse(await api('POST', '/api/auth/login', { body: { badgeNumber, password } }))
  setSessionToken(result.token)
  return result
}

/** The one time first account of a brand new installation; signs it in. */
export async function bootstrapFirstAccount(input: BootstrapInput) {
  const body = bootstrapSchema.parse(input)
  const result = signInResultSchema.parse(await api('POST', '/api/auth/bootstrap', { body }))
  setSessionToken(result.token)
  return result
}

export async function getSession() {
  return sessionSchema.parse(await api('GET', '/api/auth/session'))
}

export async function signOut() {
  try {
    await api('POST', '/api/auth/logout')
  } finally {
    setSessionToken(null)
  }
}

/** Debug builds only: flips the installation between Facility and Head
 * Office, and signs out because the accounts on each side differ. */
export async function setDevRole(isHeadOffice: boolean) {
  const account = (await api('POST', '/api/system/dev/role', { body: { isHeadOffice } })) as { badgeNumber: string; password: string }
  setSessionToken(null)
  return account
}
