import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createOfficerSchema,
  createOfficerTrustedSchema,
  officerErrorSchema,
  officerSchema,
  OfficerError,
  type CreateOfficerInput,
  type CreateOfficerTrustedInput,
  type UpdateOfficerInput,
  type UpdateOfficerTrustedInput,
} from './schema'

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

/** Tauri rejects a command whose Result::Err serializes to `{ code,
 * message }` with exactly that object, not a string — this normalizes
 * both transports to the same `OfficerError` so a caller can branch on
 * `error.code` either way. */
async function invokeOfficer<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (raw) {
    const parsed = officerErrorSchema.safeParse(raw)
    throw parsed.success ? new OfficerError(parsed.data) : raw
  }
}

export async function createOfficer(input: CreateOfficerInput) {
  const parsed = createOfficerSchema.parse(input)
  const officer = isTauri()
    ? await invokeOfficer('create_officer', { input: parsed })
    : await devFetch('/officers', { method: 'POST', body: JSON.stringify(parsed) })
  return officerSchema.parse(officer)
}

export async function updateOfficer(id: string, input: UpdateOfficerInput) {
  const officer = isTauri()
    ? await invokeOfficer('update_officer', { id, input })
    : await devFetch(`/officers/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
  return officerSchema.parse(officer)
}

export async function listOfficers(adminBadgeNumber: string, adminPassword: string) {
  const officers = isTauri()
    ? await invokeOfficer('list_officers', { adminBadgeNumber, adminPassword })
    : await devFetch('/officers/list', {
        method: 'POST',
        body: JSON.stringify({ adminBadgeNumber, adminPassword }),
      })
  return z.array(officerSchema).parse(officers)
}

/** Head Office's own versions of `createOfficer`/`updateOfficer`/
 * `listOfficers`: no admin badge or password, the signed in HQ session
 * is the credential (spec: docs/specs/prisons/0001-head-office-peer-
 * sync-network/index.md's cross child contract). */
export async function createOfficerTrusted(input: CreateOfficerTrustedInput) {
  const parsed = createOfficerTrustedSchema.parse(input)
  const officer = isTauri()
    ? await invokeOfficer('create_officer_trusted', { input: parsed })
    : await devFetch('/officers/trusted', { method: 'POST', body: JSON.stringify(parsed) })
  return officerSchema.parse(officer)
}

export async function updateOfficerTrusted(id: string, input: UpdateOfficerTrustedInput) {
  const officer = isTauri()
    ? await invokeOfficer('update_officer_trusted', { id, input })
    : await devFetch(`/officers/trusted/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
  return officerSchema.parse(officer)
}

export async function listOfficersTrusted() {
  const officers = isTauri() ? await invokeOfficer('list_officers_trusted') : await devFetch('/officers/trusted')
  return z.array(officerSchema).parse(officers)
}

/** Lightweight, badge number only lookup for routine attribution —
 * matches the pattern Police's shift check in already uses, no
 * password, deactivated officers excluded server side. */
export async function getOfficerByBadge(badgeNumber: string) {
  const officer = isTauri()
    ? await invoke('get_officer_by_badge', { badgeNumber })
    : await devFetch(`/officers/by-badge/${encodeURIComponent(badgeNumber)}`)
  return officerSchema.nullable().parse(officer)
}

export async function login(badgeNumber: string, password: string) {
  const officer = isTauri()
    ? await invokeOfficer('login', { badgeNumber, password })
    : await devFetch('/login', { method: 'POST', body: JSON.stringify({ badgeNumber, password }) })
  return officerSchema.parse(officer)
}

/** Whether this installation has zero officers yet — the one time
 * bootstrap path for creating the first admin without a preceding admin
 * credential check. */
export async function isBootstrap() {
  return isTauri() ? await invoke<boolean>('is_bootstrap') : await devFetch('/officers/is-bootstrap')
}
