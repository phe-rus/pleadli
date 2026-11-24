import { api } from '@/lib/api'
import { openExchangeFile, saveExchangeFile } from '@/lib/exchange-files'

export type FacilityIdentity = { facilityId: string; facilityName: string; jurisdiction: string | null; fingerprint: string }
export type CourtLink = { id: string; intendedCourt: string; status: string; courtName: string | null; fingerprint: string | null; inviteExpiresAt: number; respondedAt: number | null; trustedAt: number | null; revokedAt: number | null; revokedReason: string | null }
export type IncomingOrder = { id: string; courtName: string | null; status: string; sentAt: number; receivedAt: number; decidedAt: number | null; decidedBy: string | null; reason: string | null; prisonerId: string | null; payload: string }
export type OrderClaim = { kind?: string; courtNumber?: string; caseTitle?: string; accused?: string; prison?: string; remandUntil?: number | null; reference?: string | null; paragraphs?: string[] }
export type PrisonerOption = { id: string; firstName: string; lastName: string }
type WithFile = { file: string; name: string }

export const getIdentity = () => api('GET', '/api/prisons/court/identity') as Promise<FacilityIdentity | null>
export const createIdentity = (name: string, jurisdiction: string) => api('POST', '/api/prisons/court/identity', { body: { name, jurisdiction: jurisdiction.trim() || null } }) as Promise<FacilityIdentity>
export const listLinks = () => api('GET', '/api/prisons/court/links') as Promise<CourtLink[]>
export const listOrders = () => api('GET', '/api/prisons/court/orders') as Promise<IncomingOrder[]>
export const createInvite = (intendedCourt: string, validDays: number) => api('POST', '/api/prisons/court/links', { body: { intendedCourt, validDays } }) as Promise<CourtLink & WithFile>
export const trustLink = (id: string, fingerprint: string) => api('POST', `/api/prisons/court/links/${encodeURIComponent(id)}/trust`, { body: { fingerprint } }) as Promise<CourtLink & WithFile>
export const revokeLink = (id: string, reason: string) => api('POST', `/api/prisons/court/links/${encodeURIComponent(id)}/revoke`, { body: { reason } }) as Promise<CourtLink & WithFile>
export const importPackage = (file: string) => api('POST', '/api/prisons/court/import', { body: { file } }) as Promise<{ kind: string; message: string }>
export const recordOrder = (id: string, prisonerId: string) => api('POST', `/api/prisons/court/orders/${encodeURIComponent(id)}/record`, { body: { prisonerId } }) as Promise<{ instrumentId: string } & WithFile>
export const returnOrder = (id: string, reason: string) => api('POST', `/api/prisons/court/orders/${encodeURIComponent(id)}/return`, { body: { reason } }) as Promise<WithFile>
export const listPrisoners = (query: string) => api('GET', '/api/prisons/prisoners', { query: { query } }) as Promise<PrisonerOption[]>

export const pickPackage = async () => (await openExchangeFile('pxpkg'))?.contentBase64 ?? null
export const savePackage = async (sealed: WithFile) => (await saveExchangeFile({ fileName: sealed.name, contentBase64: sealed.file })) !== null
export const reportToCourt = (id: string, event: string, note: string) => api('POST', `/api/prisons/court/orders/${encodeURIComponent(id)}/report`, { body: { event, occurredAt: Date.now(), note: note.trim() || null } }) as Promise<WithFile>
