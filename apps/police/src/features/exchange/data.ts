import { api } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export type StationIdentity = { stationId: string; stationName: string; jurisdiction: string | null; fingerprint: string }
export type Connection = { id: string; officeName: string; officeJurisdiction: string | null; fingerprint: string; status: string; reason: string | null; respondedAt: number; trustedAt: number | null }
export type Incoming = { id: string; kind: string; inReplyTo: string | null; sentAt: number; receivedAt: number; payload: string; status: string; caseId: string | null; officeName: string }
export type Sealed = { file: string; name: string }

const post = (path: string, body: unknown) => api(path, { method: 'POST', body: JSON.stringify(body) })

export const getIdentity = (): Promise<StationIdentity | null> => api('/exchange/identity')
export const createIdentity = (stationName: string, jurisdiction: string): Promise<StationIdentity> => post('/exchange/identity', { stationName, jurisdiction })
export const listConnections = (): Promise<Connection[]> => api('/exchange/connections')
export const listIncoming = (): Promise<Incoming[]> => api('/exchange/incoming')
export const acceptInvite = (file: string, officerInCharge: string): Promise<{ connection: Connection } & Sealed> => post('/exchange/accept-invite', { file, officerInCharge })
export const importPackage = (file: string): Promise<{ kind: string; message: string }> => post('/exchange/import', { file })
export const exportReferral = (id: string, route: 'file' | 'postbox'): Promise<Sealed> => post(`/exchange/referrals/${encodeURIComponent(id)}/export`, { route })

const toBase64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Asks for a package file and returns it as base64, or null if cancelled. */
export async function pickPackage(): Promise<string | null> {
  if (isTauri()) {
    const path = await open({ multiple: false, filters: [{ name: 'Pleadli package', extensions: ['pxpkg'] }] })
    if (!path || Array.isArray(path)) return null
    return (await invoke('read_paper_file', { path })) as string
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pxpkg'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? toBase64(new Uint8Array(await file.arrayBuffer())) : null)
    }
    input.click()
  })
}

/** Saves a package to the Downloads folder. */
export async function savePackage(sealed: Sealed): Promise<boolean> {
  if (isTauri()) {
    const { downloadPath, saidSaved } = await import('@/lib/downloads')
    const path = await downloadPath(sealed.name)
    await invoke('save_paper_file', { path, data: sealed.file })
    saidSaved(path)
    return true
  }
  const bytes = Uint8Array.from(atob(sealed.file), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }))
  const a = document.createElement('a')
  a.href = url
  a.download = sealed.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return true
}

export type Outgoing = { id: string; kind: string; seq: number; preparedAt: number; exportedAt: number | null; route: string | null; officeName: string; policeReference: string | null }
export const listOutgoing = (): Promise<Outgoing[]> => api('/exchange/outgoing')

export type ServiceResult = { name: string; served: boolean; reason: string | null; servedAt: number | null }
export type HearingMinute = {
  policeReference: string
  dppReference?: string | null
  courtCaseNumber?: string | null
  heardAt: number
  nextDate?: number | null
  adjournmentCause?: string | null
  witnessesToServe: { name: string; role?: string | null }[]
  exhibitsToProduce: string[]
  note?: string | null
}

export const matchMinute = (incomingId: string, caseId: string): Promise<void> => post(`/exchange/incoming/${encodeURIComponent(incomingId)}/case`, { caseId }).then(() => undefined)
export const saveServiceReport = (minuteId: string, results: ServiceResult[]): Promise<Sealed> => post(`/exchange/minutes/${encodeURIComponent(minuteId)}/service-report`, { results, reportedBy: null })
export const sendServiceReport = (minuteId: string, results: ServiceResult[]): Promise<{ packageId: string }> => post(`/relay/minutes/${encodeURIComponent(minuteId)}/service-report`, { results, reportedBy: null })
