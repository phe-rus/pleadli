import { api } from '@/lib/api'
import * as z from 'zod'
import { inboxDetailSchema, inboxItemSchema, type ManualInput } from './schema'

export async function listInbox() {
  return z.array(inboxItemSchema).parse(await api('GET', '/api/prisons/inbox'))
}

export async function getUnreadCount() {
  return z.object({ unread: z.number() }).parse(await api('GET', '/api/prisons/inbox/unread-count')).unread
}

export async function getInboxItem(id: string) {
  return inboxDetailSchema.parse(await api('GET', `/api/prisons/inbox/${id}`))
}

export async function markInboxRead(id: string) {
  await api('POST', `/api/prisons/inbox/${id}/read`)
}

export async function setInboxStatus(input: { id: string; status: 'acknowledged' | 'actioned' | 'dismissed'; note?: string }) {
  await api('POST', `/api/prisons/inbox/${input.id}/status`, { body: { status: input.status, note: input.note ?? null } })
}

export async function recordCommunication(input: ManualInput) {
  return z.object({ id: z.string() }).parse(await api('POST', '/api/prisons/inbox', { body: input })).id
}
