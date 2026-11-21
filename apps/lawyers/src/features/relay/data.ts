import { api, seg } from '@/lib/api'
import type { RelayStatus } from '@pleadli/shell'

export const getRelay = async () => (await api('GET', '/api/relay')) as RelayStatus
export const checkRelay = async () => (await api('POST', '/api/relay/check', { body: {} })) as RelayStatus
export const reopenReceived = async (id: string) => (await api('POST', `/api/relay/inbox/${seg(id)}/reopen`, { body: {} })) as RelayStatus
