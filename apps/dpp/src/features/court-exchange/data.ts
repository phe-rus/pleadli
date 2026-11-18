import { api } from '@/lib/api'
import { invoke } from '@tauri-apps/api/core'

export type CourtLink = { id: string; courtName: string; courtJurisdiction: string | null; fingerprint: string; status: string; reason: string | null; respondedAt: number; trustedAt: number | null }
type Sealed = { file: string; name: string }

export const listCourtLinks = () => api('GET', '/api/court/links') as Promise<CourtLink[]>
export const answerInvite = (file: string, contact: string) => api('POST', '/api/court/answer', { body: { file, contact: contact.trim() || null } }) as Promise<CourtLink & Sealed>
export const importCourtPackage = (file: string) => api('POST', '/api/court/import', { body: { file } }) as Promise<{ kind: string; message: string }>
export const fileToCourt = (id: string, courtLevel: string, filedBy: string) => api('POST', `/api/court/files/${encodeURIComponent(id)}/file`, { body: { courtLevel, filedBy: filedBy.trim() || null } }) as Promise<Sealed>

export const pickCourtPackage = () => invoke<string | null>('pick_court_package')
export const saveCourtPackage = (sealed: Sealed) => invoke<boolean>('save_court_package', { name: sealed.name, contentBase64: sealed.file })

/** This office's own fingerprint: the code the registry types to confirm it. */
export const ownFingerprint = async () => ((await api('GET', '/api/interchange/identity')) as { fingerprint: string } | null)?.fingerprint ?? null
