import * as z from 'zod'

/** What a file needs next, who it waits on, and whether that is the person
 * signed in. Decided once in the backend (src-tauri/src/domain/attention.rs);
 * every screen reads this and none works it out for itself. */
export const nextSchema = z.object({
  fileId: z.string(),
  action: z.enum(['allocate', 'read', 'decide', 'prepare', 'send', 'await_police', 'follow_court', 'closed']),
  holder: z.enum(['office', 'officer', 'director', 'police', 'nobody']),
  holderId: z.string().nullable(),
  holderName: z.string().nullable(),
  heldByMe: z.boolean(),
  needsMe: z.boolean(),
  dueAt: z.number().nullable(),
  overdue: z.boolean(),
})
export type Next = z.infer<typeof nextSchema>

export const summarySchema = z.object({
  total: z.number(),
  toAllocate: z.number(),
  toRead: z.number(),
  toDecide: z.number(),
  toSend: z.number(),
  overdue: z.number(),
  waiting: z.number(),
  withPolice: z.number(),
  inCourt: z.number(),
  withColleagues: z.number(),
  unallocated: z.number(),
})
export type Summary = z.infer<typeof summarySchema>

export const attentionSchema = z.object({ items: z.array(nextSchema), summary: summarySchema })
export type Attention = z.infer<typeof attentionSchema>
