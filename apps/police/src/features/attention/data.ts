import { api } from '@/lib/api'
import * as z from 'zod'

/** What the station has to do next. Worked out once, by the application's own rules (see `domain::attention` in
 * the Rust side); nothing here decides what a status means. */
const obligationSchema = z.object({
  kind: z.enum(['directions', 'not_accepted', 'declined', 'witnesses', 'exhibits']),
  count: z.number(),
  names: z.array(z.string()),
  dueAt: z.number().nullable(),
  urgent: z.boolean(),
  sourceId: z.string().nullable(),
})

const standingSchema = z.object({
  caseId: z.string(),
  reference: z.string(),
  stage: z.enum(['investigating', 'with_dpp', 'returned', 'not_accepted', 'declined', 'sanctioned', 'closed']),
  folder: z.enum(['investigating', 'dpp', 'closed']),
  withDpp: z.enum(['awaiting_reply', 'accepted']).nullable(),
  referredAt: z.number().nullable(),
  referredTo: z.string().nullable(),
  referredBy: z.string().nullable(),
  obligations: z.array(obligationSchema),
})

const custodySchema = z.object({
  recordId: z.string(),
  personId: z.string(),
  personName: z.string(),
  caseId: z.string().nullable(),
  caseReference: z.string().nullable(),
  arrestedAt: z.number(),
  deadline: z.number(),
  basis: z.enum(['arrest', 'transfer_window', 'after_transfer']),
  hoursRemaining: z.number(),
  state: z.enum(['past', 'due', 'ok']),
})

export const attentionSchema = z.object({
  now: z.number(),
  dueSoonHours: z.number(),
  counts: z.object({
    inCells: z.number(),
    custodyDue: z.number(),
    custodyPast: z.number(),
    investigating: z.number(),
    withDpp: z.number(),
    closed: z.number(),
    casesNeedingAction: z.number(),
    awaitingReply: z.number(),
    minutesToMatch: z.number(),
  }),
  custody: z.array(custodySchema),
  cases: z.array(standingSchema),
})

export type Attention = z.infer<typeof attentionSchema>
export type CaseStanding = z.infer<typeof standingSchema>
export type Obligation = z.infer<typeof obligationSchema>
export type CustodyItem = z.infer<typeof custodySchema>

export async function getAttention() {
  return attentionSchema.parse(await api('/attention'))
}
