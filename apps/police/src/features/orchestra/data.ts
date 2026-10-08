import { api, ApiError } from '@/lib/api'

/** What this computer knows about its Pleadli licence and backups
 * (pleadli_node_core::orchestra::Status). */
export type OrchestraStatus = {
  state: 'trial' | 'trial_ended' | 'licensed' | 'licence_ended'
  reason: string | null
  trialEndsAt: number
  trialDaysLeft: number
  licence: { institution: string; address: string | null; seats: number; expiresAt: number; validUntil: number } | null
  lastContactAt: number | null
  lastError: string | null
  office: string | null
  offices: { address: string; name: string }[]
  backup: {
    keyFingerprint: string | null
    storage: { id: string; label: string; kind: 's3' | 'folder' | 'sftp' | string; approved: boolean; place: string }[]
    lastOkAt: number | null
    history: BackupRun[]
    running: boolean
  }
  papers: { waiting: number; sent: number; failed: number }
  device: string
  canVerify: boolean
  restorePending: boolean
}

export type BackupRun = { id: string; storageId: string | null; storageLabel: string | null; at: number; sizeBytes: number | null; ok: boolean; message: string | null }

export type StagedRestore = { createdAt: number; computer: string; documents: number; missing: number }

/** The code an Orchestra refusal carries (offline, unknown_key, seats_full,
 * no_storage, restore_phrase, ...), for the window to say in its own words. */
export function orchestraErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  try {
    const body = JSON.parse(error.message) as { code?: string }
    return body.code ?? null
  } catch {
    return null
  }
}

const post = (path: string, body?: unknown) => api(`/orchestra${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const getOrchestra = (): Promise<OrchestraStatus> => api('/orchestra')
export const contactNow = (): Promise<OrchestraStatus> => post('/contact')
export const activateLicence = (key: string): Promise<OrchestraStatus> => post('/activate', { key })
export const chooseOffice = (address: string): Promise<OrchestraStatus> => post('/office', { address })
export const backUpNow = (): Promise<BackupRun[]> => post('/backup')
export const checkStorage = (id: string): Promise<{ ok: boolean }> => post(`/storage/${encodeURIComponent(id)}/check`)
export const sendPapers = (): Promise<{ sent: number }> => post('/papers/send')
export const stageRestore = (path: string, phrase: string): Promise<StagedRestore> => post('/restore', { path, phrase })
export const cancelRestore = (): Promise<{ ok: boolean }> => post('/restore/cancel')
