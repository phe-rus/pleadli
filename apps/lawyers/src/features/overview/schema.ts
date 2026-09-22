import * as z from 'zod'
import { diaryRowSchema } from '../hearings/schema'

export const attentionSchema = z.object({
  kind: z.enum(['hearing_not_closed', 'no_hearing', 'task_overdue', 'task_soon', 'plea_unconfirmed']),
  matterId: z.string().nullable(),
  matterTitle: z.string().nullable(),
  courtNumber: z.string().nullable(),
  at: z.number().nullable(),
  detail: z.string().nullable(),
  refId: z.string().nullable(),
})
export type Attention = z.infer<typeof attentionSchema>

export const overviewSchema = z.object({
  counts: z.object({
    openMatters: z.number(),
    hearingsToday: z.number(),
    notClosed: z.number(),
    noHearing: z.number(),
    tasksOpen: z.number(),
    tasksOverdue: z.number(),
    draftDocuments: z.number(),
  }),
  hearings: z.array(diaryRowSchema),
  upcoming: z.array(diaryRowSchema),
  attention: z.array(attentionSchema),
  recentAdjournments: z.array(z.number()),
  reasonCounts: z.array(z.object({ reason: z.string(), count: z.number() })),
})
export type Overview = z.infer<typeof overviewSchema>
