import { api, ApiError } from '@/lib/api'

const seg = encodeURIComponent

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
  return error instanceof ApiError ? error.code : null
}

const post = (path: string, body?: unknown) => api('POST', `/api/orchestra${path}`, { body: body ?? {} })

export const getOrchestra = () => api('GET', '/api/orchestra') as Promise<OrchestraStatus>
export const contactNow = () => post('/contact') as Promise<OrchestraStatus>
export const activateLicence = (key: string) => post('/activate', { key }) as Promise<OrchestraStatus>
export const chooseOffice = (address: string) => post('/office', { address }) as Promise<OrchestraStatus>
export const backUpNow = () => post('/backup') as Promise<BackupRun[]>
export const checkStorage = (id: string) => post(`/storage/${seg(id)}/check`) as Promise<{ ok: boolean }>
export const sendPapers = () => post('/papers/send') as Promise<{ sent: number }>
export const stageRestore = (path: string, phrase: string) => post('/restore', { path, phrase }) as Promise<StagedRestore>
export const cancelRestore = () => post('/restore/cancel') as Promise<{ ok: boolean }>
