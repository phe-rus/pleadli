import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const connectionStates = ['not_connected', 'awaiting_approval', 'rejected', 'revoked', 'paired', 'connected', 'offline', 'needs_attention', 'stalled', 'disconnected'] as const
export type ConnectionState = (typeof connectionStates)[number]

export const syncClassSchema = z.object({
  class: z.string(),
  direction: z.enum(['up', 'down']),
  enabled: z.boolean(),
  label: z.string(),
  description: z.string(),
  pending: z.number(),
})

export const exchangeStates = ['idle', 'pending', 'in_progress', 'completed', 'failed', 'stalled', 'offline'] as const
export type ExchangeState = (typeof exchangeStates)[number]

export const exchangeRoundSchema = z.object({
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  trigger: z.string(),
  outcome: z.string().nullable(),
  sentRoster: z.number(),
  sentStatus: z.number(),
  sentReturns: z.number(),
  receivedPolicy: z.number(),
  error: z.string().nullable(),
})

export const exchangeStatusSchema = z.object({
  state: z.enum(exchangeStates),
  lastSuccessAt: z.number().nullable(),
  lastAttemptAt: z.number().nullable(),
  lastOutcome: z.string().nullable(),
  consecutiveFailures: z.number(),
  stalledSince: z.number().nullable(),
  recent: z.array(exchangeRoundSchema),
})

export const connectivityStatusSchema = z.object({
  state: z.enum(connectionStates),
  exchange: exchangeStatusSchema,
  certificatePinned: z.boolean(),
  headOfficeAddress: z.string().nullable(),
  facilityReference: z.string().nullable(),
  lastExchangeAt: z.number().nullable(),
  neverSynced: z.boolean(),
  pending: z.object({ total: z.number(), roster: z.number(), returns: z.number() }),
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
  paired: { get label() { return m.connectivity_paired() }, dot: 'bg-emerald-500/60', get sentence() { return m.connectivity_paired_sentence() } },
  stalled: { get label() { return m.connectivity_stalled() }, dot: 'bg-amber-500', get sentence() { return m.connectivity_stalled_sentence() } },
  revoked: { get label() { return m.connectivity_revoked() }, dot: 'border border-destructive', get sentence() { return m.connectivity_revoked_sentence() } },
  disconnected: { get label() { return m.connectivity_disconnected() }, dot: 'border border-muted-foreground', get sentence() { return m.connectivity_disconnected_from_head_office_local_pris() } },
  not_connected: { get label() { return m.connectivity_not_connected() }, dot: 'border border-muted-foreground', get sentence() { return m.connectivity_working_on_its_own_you_can() } },
}

/** How the exchange itself reads, apart from whether a link exists. */
export const exchangeCopy: Record<ExchangeState, string> = {
  get idle() { return m.connectivity_exchange_idle() },
  get pending() { return m.connectivity_exchange_pending() },
  get in_progress() { return m.connectivity_exchange_in_progress() },
  get completed() { return m.connectivity_exchange_completed() },
  get failed() { return m.connectivity_exchange_failed() },
  get stalled() { return m.connectivity_exchange_stalled() },
  get offline() { return m.connectivity_exchange_offline() },
}

export const transportLabel = { get internet() { return m.connectivity_internet() }, get local_network() { return m.connectivity_local_network() }, get none() { return m.connectivity_none() } } as const
