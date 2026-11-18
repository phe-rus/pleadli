import { api } from '@/lib/api'
import { invoke } from '@tauri-apps/api/core'

export type RegistryIdentity = { officeId: string; officeName: string; jurisdiction: string | null; fingerprint: string }
export type Link = { id: string; intendedOffice: string; status: string; dppName: string | null; fingerprint: string | null; inviteExpiresAt: number; respondedAt: number | null; trustedAt: number | null }
export type Incoming = { id: string; dppName: string | null; status: string; sentAt: number; receivedAt: number; decidedAt: number | null; rejectReason: string | null; caseId: string | null; payload: string }
type WithFile = { file: string; name: string }

export const getIdentity = () => api('GET', '/api/exchange/identity') as Promise<RegistryIdentity | null>
export const createIdentity = (name: string, jurisdiction: string) => api('POST', '/api/exchange/identity', { body: { name, jurisdiction: jurisdiction.trim() || null } }) as Promise<RegistryIdentity>
export const listLinks = () => api('GET', '/api/exchange/links') as Promise<Link[]>
export const listIncoming = () => api('GET', '/api/exchange/incoming') as Promise<Incoming[]>
export const createInvite = (intendedOffice: string, validDays: number) => api('POST', '/api/exchange/links', { body: { intendedOffice, validDays } }) as Promise<Link & WithFile>
export const trustLink = (id: string, fingerprint: string) => api('POST', `/api/exchange/links/${encodeURIComponent(id)}/trust`, { body: { fingerprint } }) as Promise<Link & WithFile>
export const importPackage = (file: string) => api('POST', '/api/exchange/import', { body: { file } }) as Promise<{ kind: string; message: string }>
export const acceptFiling = (id: string, courtNumber: string, decidedBy: string) => api('POST', `/api/exchange/incoming/${encodeURIComponent(id)}/accept`, { body: { courtNumber, decidedBy } }) as Promise<{ caseId: string } & WithFile>
export const rejectFiling = (id: string, reason: string, decidedBy: string) => api('POST', `/api/exchange/incoming/${encodeURIComponent(id)}/reject`, { body: { reason, decidedBy } }) as Promise<WithFile>

/** Asks for a package in the window's own open dialog; base64, or null if cancelled. */
export const pickPackage = () => invoke<string | null>('pick_package')
/** Saves a package where the person chooses in the window's own save dialog. */
export const savePackage = (sealed: WithFile) => invoke<boolean>('save_package', { name: sealed.name, contentBase64: sealed.file })

export type PrisonLink = { id: string; prisonName: string; prisonJurisdiction: string | null; fingerprint: string; status: string; reason: string | null; respondedAt: number; trustedAt: number | null }
export type Delivery = { orderId: string; prisonName: string; preparedAt: number; outcome: string | null; reason: string | null }
export const listPrisonLinks = () => api('GET', '/api/exchange/prisons') as Promise<PrisonLink[]>
export const answerPrisonInvite = (file: string, contact: string) => api('POST', '/api/exchange/prisons/answer', { body: { file, contact: contact.trim() || null } }) as Promise<PrisonLink & WithFile>
export const importPrisonPackage = (file: string) => api('POST', '/api/exchange/prisons/import', { body: { file } }) as Promise<{ kind: string; message: string }>
export const sendOrder = (id: string, linkId: string) => api('POST', `/api/orders/${encodeURIComponent(id)}/send`, { body: { linkId } }) as Promise<WithFile>
export const listDeliveries = (id: string) => api('GET', `/api/orders/${encodeURIComponent(id)}/deliveries`) as Promise<Delivery[]>

export type FirmLink = { id: string; firmName: string; firmJurisdiction: string | null; fingerprint: string; status: string; reason: string | null; respondedAt: number; trustedAt: number | null }
export type FirmDelivery = { noticeKey: string; firmName: string; preparedAt: number; outcome: string | null; reason: string | null }
export const listFirmLinks = () => api('GET', '/api/exchange/firms') as Promise<FirmLink[]>
export const answerFirmInvite = (file: string, contact: string) => api('POST', '/api/exchange/firms/answer', { body: { file, contact: contact.trim() || null } }) as Promise<FirmLink & WithFile>
export const importFirmPackage = (file: string) => api('POST', '/api/exchange/firms/import', { body: { file } }) as Promise<{ kind: string; message: string }>
export const notify = (kind: 'order' | 'sitting', id: string, linkId: string) => api('POST', `/api/${kind === 'order' ? 'orders' : 'sittings'}/${encodeURIComponent(id)}/notify`, { body: { linkId } }) as Promise<WithFile>
export const listNoticeDeliveries = (id: string) => api('GET', `/api/notices/${encodeURIComponent(id)}/deliveries`) as Promise<FirmDelivery[]>
