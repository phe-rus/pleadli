import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const inboxItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  origin: z.enum(['local', 'head_office', 'court', 'manual', 'system']),
  source: z.string(),
  subject: z.string(),
  body: z.string().nullable(),
  relatedType: z.string().nullable(),
  relatedId: z.string().nullable(),
  relatedRoute: z.string().nullable(),
  status: z.enum(['new', 'acknowledged', 'actioned', 'dismissed']),
  createdAt: z.number(),
  actionedAt: z.number().nullable(),
  resolution: z.string().nullable(),
  actionedByName: z.string().nullable(),
  recordedByName: z.string().nullable(),
  recipient: z.string(),
  read: z.boolean(),
})

export type InboxItem = z.infer<typeof inboxItemSchema>

export const inboxDetailSchema = inboxItemSchema.extend({
  reads: z.array(z.object({ officerName: z.string(), readAt: z.number() })),
})

export type InboxDetail = z.infer<typeof inboxDetailSchema>

export type ManualInput = { source: string; subject: string; body: string | null; relatedPrisonerId: string | null }

/** Open means it still needs someone. Closed items stay for the record. */
export const isOpen = (item: Pick<InboxItem, 'status'>) => item.status === 'new' || item.status === 'acknowledged'

export const kindLabel: Record<string, string> = {
  get obligation() { return m.notifications_obligation() },
  get backup() { return m.notifications_backup() },
  get connection() { return m.notifications_connection() },
  get communication() { return m.notifications_communication() },
  get facility_request() { return m.notifications_facility_request() },
  get court() { return m.notifications_court() },
  get directive() { return m.notifications_directive() },
}

export const originLabel: Record<InboxItem['origin'], string> = {
  get local() { return m.notifications_this_facility() },
  get head_office() { return m.notifications_head_office() },
  get court() { return m.notifications_court() },
  get manual() { return m.notifications_recorded_by_an_officer() },
  get system() { return m.notifications_system() },
}

export const statusLabel: Record<InboxItem['status'], string> = {
  get new() { return m.notifications_new() },
  get acknowledged() { return m.notifications_acknowledged() },
  get actioned() { return m.notifications_actioned() },
  get dismissed() { return m.notifications_dismissed() },
}

export const inboxFilters = [
  { id: 'all', get label() { return m.notifications_all() } },
  { id: 'unread', get label() { return m.notifications_unread() } },
  { id: 'open', get label() { return m.notifications_needs_action() } },
  { id: 'court', get label() { return m.notifications_court() } },
  { id: 'head_office', get label() { return m.notifications_head_office() } },
  { id: 'local', get label() { return m.notifications_this_facility() } },
] as const

export type InboxFilter = (typeof inboxFilters)[number]['id']

export function matchesFilter(item: InboxItem, filter: InboxFilter) {
  switch (filter) {
    case 'unread':
      return !item.read && isOpen(item)
    case 'open':
      return isOpen(item)
    case 'court':
      return item.origin === 'court'
    case 'head_office':
      return item.origin === 'head_office'
    case 'local':
      return item.origin === 'local' || item.origin === 'manual' || item.origin === 'system'
    default:
      return true
  }
}
