import * as z from 'zod'

/** One thing owed on a file. A file can owe several at once: a paper to
 * prepare, a hearing tomorrow, a task for a colleague. */
export const obligationSchema = z.object({
  kind: z.enum(['allocate', 'read', 'decide', 'director_decision', 'prepare', 'send', 'police_reply', 'hearing', 'time_limit', 'task']),
  dueAt: z.number().nullable(),
  overdue: z.boolean(),
  mine: z.boolean(),
  /** Which time limit, or what the task says. */
  detail: z.string().nullable(),
})
export type Obligation = z.infer<typeof obligationSchema>

/** What a file needs next, who it waits on, and whether that is the person
 * signed in. Decided once in the backend (src-tauri/src/domain/attention.rs);
 * every screen reads this and none works it out for itself.
 *
 * Four separate answers: `state` is where the file is, `obligations` is
 * everything owed on it, `primary` is the one to do first, and `needsMe`,
 * `heldByMe` and `canTake` are the signed-in person's own part. */
export const nextSchema = z.object({
  fileId: z.string(),
  /** The stage's next step. Not the whole story: see `obligations`. */
  action: z.enum(['allocate', 'read', 'decide', 'prepare', 'send', 'await_police', 'follow_court', 'closed']),
  state: z.enum(['unallocated', 'reading', 'deciding', 'preparing', 'sending', 'with_police', 'in_court', 'closed']),
  holder: z.enum(['office', 'officer', 'director', 'police', 'nobody']),
  holderId: z.string().nullable(),
  holderName: z.string().nullable(),
  heldByMe: z.boolean(),
  needsMe: z.boolean(),
  canTake: z.boolean(),
  obligations: z.array(obligationSchema),
  primary: obligationSchema.nullable(),
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
  toFollowUp: z.number(),
  overdue: z.number(),
  withSeveral: z.number(),
  waiting: z.number(),
  withPolice: z.number(),
  inCourt: z.number(),
  withColleagues: z.number(),
  unallocated: z.number(),
})
export type Summary = z.infer<typeof summarySchema>

export const attentionSchema = z.object({ items: z.array(nextSchema), summary: summarySchema })
export type Attention = z.infer<typeof attentionSchema>
