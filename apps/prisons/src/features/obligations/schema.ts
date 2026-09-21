import * as z from 'zod'
import { facilityProfileSchema } from '@/features/facility/schema'
import { m } from '@/paraglide/messages'

export const obligationSchema = z.object({
  key: z.string(),
  kind: z.string(),
  group: z.enum(['due', 'exception']),
  prisonerId: z.string().nullable(),
  prisonerName: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  dueAt: z.number().nullable(),
  procedure: z.object({ kind: z.string(), id: z.string().nullable() }).nullable(),
  resolvable: z.boolean(),
})

export type Obligation = z.infer<typeof obligationSchema>

export const populationSchema = z.object({
  held: z.number(),
  convicted: z.number(),
  unconvicted: z.number(),
  civil: z.number(),
  inTransit: z.number(),
  hospitalised: z.number(),
  capacity: z.number().nullable(),
})

export const movementCountsSchema = z.object({
  preparing: z.number(),
  inTransit: z.number(),
  awaitingConfirmation: z.number(),
  /** Productions dated today that are still scheduled, with no outcome yet. */
  courtToday: z.number(),
  /** Productions dated today whose outcome has been recorded. */
  courtDoneToday: z.number(),
})

/** What has happened so far today. A person who arrives by transfer is a
 * transfer, not also an admission. */
export const dayCountsSchema = z.object({
  admitted: z.number(),
  discharged: z.number(),
  transferredOut: z.number(),
  transferredIn: z.number(),
})

/** One thing that happened, taken from a real record. `detail` is that
 * record's own type or state (a release type, the other prison, a court state,
 * a visit type, a request category, a health event type). */
export const recentEventSchema = z.object({
  at: z.number(),
  kind: z.enum(['admitted', 'discharged', 'transfer_out', 'transfer_in', 'court', 'visit', 'request_raised', 'request_resolved', 'health']),
  prisonerId: z.string().nullable(),
  prisonerName: z.string().nullable(),
  detail: z.string().nullable(),
})
export type RecentEvent = z.infer<typeof recentEventSchema>

export const recentSchema = z.object({
  admitted: z.number(),
  discharged: z.number(),
  transferredOut: z.number(),
  transferredIn: z.number(),
  events: z.array(recentEventSchema),
  weeks: z.array(z.object({ startsAt: z.number(), admitted: z.number(), discharged: z.number() })),
})

export const remandSchema = z.object({
  pastThreshold: z.number(),
  within14Days: z.number(),
  longestHeldDays: z.number().nullable(),
})

export const courtActivitySchema = z.object({
  next7Days: z.number(),
  /** Scheduled productions from before today that have no outcome yet. */
  awaitingOutcome: z.number(),
})

export const careSchema = z.object({
  visitsToday: z.number(),
  visitsCompletedToday: z.number(),
  /** Visit requests still waiting for a decision, whatever day they are for. */
  visitsAwaitingDecision: z.number(),
  healthEvents30Days: z.number(),
  openRequests: z.number(),
  oldestOpenRequestAt: z.number().nullable(),
})

export const todayViewSchema = z.object({
  now: z.number(),
  facility: facilityProfileSchema,
  population: populationSchema,
  movements: movementCountsSchema,
  day: dayCountsSchema,
  recent: recentSchema,
  remand: remandSchema,
  court: courtActivitySchema,
  care: careSchema,
  obligations: z.array(obligationSchema),
})

export type TodayView = z.infer<typeof todayViewSchema>

export const resolveObligationSchema = z.object({
  key: z.string().min(1),
  kind: z.string().min(1),
  prisonerId: z.string().nullable(),
  actionTaken: z.string().min(1, 'Record the action taken.'),
})

export type ResolveObligationInput = z.infer<typeof resolveObligationSchema>

const DAY_MS = 86_400_000

export type Bucket = 'overdue' | 'today' | 'soon' | 'open'

/** Where an obligation sits on the queue, by its due time against the start of today (local zone). */
export function bucketOf(obligation: Pick<Obligation, 'dueAt'>, now: number): Bucket {
  if (obligation.dueAt == null) return 'open'
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const start = startOfToday.getTime()
  if (obligation.dueAt < start) return 'overdue'
  if (obligation.dueAt < start + DAY_MS) return 'today'
  return 'soon'
}

export const bucketLabels: Record<Bucket, string> = {
  get overdue() { return m.obligations_overdue() },
  get today() { return m.obligations_today() },
  get soon() { return m.obligations_coming_up() },
  get open() { return m.obligations_waiting() },
}
