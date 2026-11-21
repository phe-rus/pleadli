import { api } from '@/lib/api'

export type Stage = 'queued' | 'sent' | 'delivered' | 'opened' | 'accepted' | 'rejected' | 'attention' | 'expired'
export type RelaySent = {
  id: string
  to: string
  office: string | null
  kind: string
  policeReference: string | null
  stage: Stage
  reason: string | null
  dppReference: string | null
  error: string | null
  attempts: number
  queuedAt: number
  postedAt: number | null
  ackedAt: number | null
}
export type RelayInvitation = { officeName: string; fingerprint: string; intendedStation: string; expiresAt: number }
export type RelayReceived = { id: string; from: string; kind: string; size: number; status: 'new' | 'imported' | 'refused'; reason: string | null; arrivedAt: number; handledAt: number | null; invitation: RelayInvitation | null }
export type RelayStatus = { ready: boolean; whyNot: string | null; address: string | null; site: string; last: { at: number | null; error: string | null }; sent: RelaySent[]; received: RelayReceived[] }

const post = (path: string, body: unknown = {}) => api(path, { method: 'POST', body: JSON.stringify(body) })

export const getRelay = (): Promise<RelayStatus> => api('/relay')
export const checkRelay = (): Promise<RelayStatus> => post('/relay/check')
export const retryRelay = (id?: string): Promise<RelayStatus> => post('/relay/retry', { id: id ?? null })
export const sendByPostbox = (referralId: string): Promise<{ packageId: string }> => post(`/relay/referrals/${encodeURIComponent(referralId)}/send`)
export const answerInvitation = (id: string, officerInCharge: string): Promise<RelayStatus> => post(`/relay/invitations/${encodeURIComponent(id)}/answer`, { officerInCharge })
export const declineInvitation = (id: string, reason: string): Promise<RelayStatus> => post(`/relay/invitations/${encodeURIComponent(id)}/decline`, { reason })
export const reopenReceived = (id: string): Promise<RelayStatus> => post(`/relay/inbox/${encodeURIComponent(id)}/reopen`)
