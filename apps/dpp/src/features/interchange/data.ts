import * as m from '@/paraglide/messages'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { api, devInterchangeInviteUrl, devInterchangeOutgoingUrl, seg } from '@/lib/api'
import {
  acceptedSchema,
  connectionSchema,
  identitySchema,
  importOutcomeSchema,
  incomingDetailSchema,
  incomingSummarySchema,
  outgoingSchema,
  preparedSchema,
  type ImportOutcome,
} from './schema'

export async function getIdentity() {
  return identitySchema.nullable().parse(await api('GET', '/api/interchange/identity'))
}

export async function createIdentity(officeName: string, jurisdiction: string) {
  return identitySchema.parse(await api('POST', '/api/interchange/identity', { body: { officeName, jurisdiction: jurisdiction.trim() || null } }))
}

export async function listConnections() {
  return z.array(connectionSchema).parse(await api('GET', '/api/interchange/connections'))
}

export async function createInvite(intendedStation: string, validDays: number) {
  return connectionSchema.parse(await api('POST', '/api/interchange/connections', { body: { intendedStation, validDays } }))
}

export async function trustConnection(id: string, fingerprint: string) {
  return connectionSchema.parse(await api('POST', `/api/interchange/connections/${seg(id)}/trust`, { body: { fingerprint } }))
}

export async function declineConnection(id: string, reason: string) {
  return connectionSchema.parse(await api('POST', `/api/interchange/connections/${seg(id)}/decline`, { body: { reason: reason || null } }))
}

export async function revokeConnection(id: string, reason: string) {
  return connectionSchema.parse(await api('POST', `/api/interchange/connections/${seg(id)}/revoke`, { body: { reason } }))
}

export async function listIncoming() {
  return z.array(incomingSummarySchema).parse(await api('GET', '/api/interchange/incoming'))
}

export async function getIncoming(id: string) {
  return incomingDetailSchema.parse(await api('GET', `/api/interchange/incoming/${seg(id)}`))
}

export async function acceptIncoming(id: string, input: { title: string; odppRegistrationNumber: string; personMatches: Record<string, string | null> }) {
  const body = { title: input.title.trim() || null, odppRegistrationNumber: input.odppRegistrationNumber.trim() || null, personMatches: input.personMatches }
  return acceptedSchema.parse(await api('POST', `/api/interchange/incoming/${seg(id)}/accept`, { body }))
}

export async function rejectIncoming(id: string, reason: string) {
  await api('POST', `/api/interchange/incoming/${seg(id)}/reject`, { body: { reason } })
}

export async function listOutgoing() {
  return z.array(outgoingSchema).parse(await api('GET', '/api/interchange/outgoing'))
}

export async function prepareNotice(decisionId: string) {
  return preparedSchema.parse(await api('POST', `/api/interchange/decisions/${seg(decisionId)}/notice`))
}

/** Takes in a package. On the desktop the operating system's dialog picks the
 * file and the backend reads it; in a browser a file is passed in. Returns null
 * if the prosecutor cancelled. */
export async function importPackage(file?: File): Promise<ImportOutcome | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const path = await open({ multiple: false, filters: [{ name: m["interchange.package_filter"](), extensions: ['pxpkg'] }] })
    if (typeof path !== 'string') return null
    return importOutcomeSchema.parse(await invoke('import_interchange_file', { path }))
  }
  if (!file) return null
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return importOutcomeSchema.parse(await api('POST', '/api/interchange/import', { body: { dataBase64: btoa(binary) } }))
}

/** Saves an invitation or an outgoing package where the prosecutor chooses. */
export async function saveFile(kind: 'invite' | 'outgoing', id: string): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const name = await invoke<string>('interchange_file_name', { kind, id })
    const path = await save({ defaultPath: name, filters: [{ name: m["interchange.package_filter"](), extensions: ['pxpkg'] }] })
    if (!path) return false
    await invoke('save_interchange_file', { kind, id, path })
    return true
  }
  const response = await fetch(kind === 'invite' ? devInterchangeInviteUrl(id) : devInterchangeOutgoingUrl(id))
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? m["interchange.file_failed"]())
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `${kind}.pxpkg`
  link.click()
  URL.revokeObjectURL(url)
  return true
}
