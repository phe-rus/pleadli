import { api } from '@/lib/api'
import { invoke } from '@tauri-apps/api/core'

export type FirmIdentity = { officeId: string; officeName: string; jurisdiction: string | null; fingerprint: string }
export type CourtLink = { id: string; intendedCourt: string; status: string; courtName: string | null; fingerprint: string | null; inviteExpiresAt: number; respondedAt: number | null; trustedAt: number | null }
export type IncomingNotice = { id: string; courtName: string | null; status: string; sentAt: number; receivedAt: number; decidedAt: number | null; returnReason: string | null; matterId: string | null; payload: string }
export type NoticeClaim = { kind?: string; courtNumber?: string; caseTitle?: string; title?: string; at?: number | null; purpose?: string | null; courtroom?: string | null; paragraphs?: string[]; reference?: string | null }
export type MatterOption = { id: string; title: string; courtNumber: string | null }
type WithFile = { file: string; name: string }

export const getIdentity = () => api('GET', '/api/notices/identity') as Promise<FirmIdentity | null>
export const createIdentity = (name: string, jurisdiction: string) => api('POST', '/api/notices/identity', { body: { name, jurisdiction: jurisdiction.trim() || null } }) as Promise<FirmIdentity>
export const listLinks = () => api('GET', '/api/notices/links') as Promise<CourtLink[]>
export const listIncoming = () => api('GET', '/api/notices/incoming') as Promise<IncomingNotice[]>
export const createInvite = (intendedCourt: string, validDays: number) => api('POST', '/api/notices/links', { body: { intendedCourt, validDays } }) as Promise<CourtLink & WithFile>
export const trustLink = (id: string, fingerprint: string) => api('POST', `/api/notices/links/${encodeURIComponent(id)}/trust`, { body: { fingerprint } }) as Promise<CourtLink & WithFile>
export const importPackage = (file: string) => api('POST', '/api/notices/import', { body: { file } }) as Promise<{ kind: string; message: string }>
export const fileNotice = (id: string, matterId: string, decidedBy: string) => api('POST', `/api/notices/incoming/${encodeURIComponent(id)}/file`, { body: { matterId, decidedBy } }) as Promise<{ madeId: string } & WithFile>
export const returnNotice = (id: string, reason: string, decidedBy: string) => api('POST', `/api/notices/incoming/${encodeURIComponent(id)}/return`, { body: { reason, decidedBy } }) as Promise<WithFile>
export const listOpenMatters = () => api('GET', '/api/matters', { query: { view: 'open' } }) as Promise<MatterOption[]>

export const pickPackage = () => invoke<string | null>('pick_court_package')
export const savePackage = (sealed: WithFile) => invoke<boolean>('save_court_package', { name: sealed.name, contentBase64: sealed.file })
