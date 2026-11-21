import { api, seg } from '@/lib/api'

export type RelaySent = { id: string; to: string; kind: string; stage: 'queued' | 'sent' | 'delivered' | 'attention' | 'expired'; error: string | null; attempts: number; queuedAt: number; postedAt: number | null; ackedAt: number | null }
export type RelayReceived = { id: string; from: string; kind: string; size: number; status: 'new' | 'imported' | 'refused'; reason: string | null; arrivedAt: number; handledAt: number | null }
export type RelayStatus = { ready: boolean; whyNot: string | null; address: string | null; site: string; last: { at: number | null; error: string | null }; sent: RelaySent[]; received: RelayReceived[] }

export const getRelay = async () => (await api('GET', '/api/relay')) as RelayStatus
export const checkRelay = async () => (await api('POST', '/api/relay/check', { body: {} })) as RelayStatus
export const retryRelay = async (id?: string) => (await api('POST', '/api/relay/retry', { body: { id: id ?? null } })) as RelayStatus
export const reopenReceived = async (id: string) => (await api('POST', `/api/relay/inbox/${seg(id)}/reopen`, { body: {} })) as RelayStatus
export const sendInviteByPostbox = async (connectionId: string, stationAddress: string) => api('POST', `/api/relay/connections/${seg(connectionId)}/invite`, { body: { stationAddress } })
