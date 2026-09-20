import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const connectionStates = ['not_connected', 'awaiting_approval', 'rejected', 'connected', 'offline', 'needs_attention', 'disconnected'] as const
export type ConnectionState = (typeof connectionStates)[number]

export const syncClassSchema = z.object({
  class: z.string(),
  direction: z.enum(['up', 'down']),
  enabled: z.boolean(),
  label: z.string(),
  description: z.string(),
  pending: z.number(),
})

export const connectivityStatusSchema = z.object({
  state: z.enum(connectionStates),
  headOfficeAddress: z.string().nullable(),
  facilityReference: z.string().nullable(),
  lastExchangeAt: z.number().nullable(),
  neverSynced: z.boolean(),
  pending: z.object({ total: z.number(), roster: z.number(), records: z.number(), returns: z.number() }),
  transport: z.enum(['internet', 'local_network', 'none']),
  lastError: z.string().nullable(),
  disconnectedAt: z.number().nullable(),
  classes: z.array(syncClassSchema),
})

export type ConnectivityStatus = z.infer<typeof connectivityStatusSchema>
export type SyncClass = z.infer<typeof syncClassSchema>

/** How each state reads to an officer: one word, and one sentence that never
 * suggests local work is affected. `dot` is the colour of the status dot. */
export const stateCopy: Record<ConnectionState, { label: string; dot: string; sentence: string }> = {
  connected: { get label() { return m.connectivity_connected() }, dot: 'bg-emerald-500', get sentence() { return m.connectivity_connected_to_head_office_changes_are() } },
  offline: { get label() { return m.connectivity_offline() }, dot: 'border border-amber-500', get sentence() { return m.connectivity_head_office_cannot_be_reached_local() } },
  needs_attention: { get label() { return m.connectivity_needs_attention() }, dot: 'bg-amber-500', get sentence() { return m.connectivity_the_last_exchange_with_head_office() } },
  awaiting_approval: { get label() { return m.connectivity_awaiting_approval() }, dot: 'bg-amber-500', get sentence() { return m.connectivity_head_office_has_the_request_and() } },
  rejected: { get label() { return m.connectivity_not_approved() }, dot: 'border border-muted-foreground', get sentence() { return m.connectivity_head_office_did_not_approve_the() } },
  disconnected: { get label() { return m.connectivity_disconnected() }, dot: 'border border-muted-foreground', get sentence() { return m.connectivity_disconnected_from_head_office_local_pris() } },
  not_connected: { get label() { return m.connectivity_not_connected() }, dot: 'border border-muted-foreground', get sentence() { return m.connectivity_working_on_its_own_you_can() } },
}

export const transportLabel = { get internet() { return m.connectivity_internet() }, get local_network() { return m.connectivity_local_network() }, get none() { return m.connectivity_none() } } as const
