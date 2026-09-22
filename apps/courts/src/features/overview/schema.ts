import * as z from 'zod'
import { causeListRowSchema } from '../sittings/schema'

export const attentionSchema = z.object({
  kind: z.enum(['not_closed', 'no_next_date', 'remand_ending', 'remand_undated', 'record_unsigned', 'reserved']),
  caseId: z.string(),
  courtNumber: z.string(),
  caseTitle: z.string(),
  at: z.number().nullable(),
  person: z.string().nullable(),
  refId: z.string().nullable(),
})
export type Attention = z.infer<typeof attentionSchema>

export const overviewSchema = z.object({
  counts: z.object({
    openCases: z.number(),
    unscheduled: z.number(),
    draftOrders: z.number(),
    sittingsToday: z.number(),
    notClosed: z.number(),
    draftRulings: z.number(),
    unsignedRecords: z.number(),
  }),
  sittings: z.array(causeListRowSchema),
  attention: z.array(attentionSchema),
  recentAdjournments: z.array(z.number()),
  reasonCounts: z.array(z.object({ reason: z.string(), count: z.number() })),
})
export type Overview = z.infer<typeof overviewSchema>
