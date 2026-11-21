import { api } from '@/lib/api'
import type { RelayStatus } from '@pleadli/shell'

export const getRelay = async () => (await api('GET', '/api/prisons/relay')) as RelayStatus
export const checkRelay = async () => (await api('POST', '/api/prisons/relay/check', { body: {} })) as RelayStatus
export const reopenReceived = async (id: string) => (await api('POST', `/api/prisons/relay/inbox/${encodeURIComponent(id)}/reopen`, { body: {} })) as RelayStatus
