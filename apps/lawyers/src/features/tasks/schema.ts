import * as z from 'zod'

export const taskSchema = z.object({
  id: z.string(),
  matterId: z.string().nullable(),
  hearingId: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  dueOn: z.number().nullable(),
  doneAt: z.number().nullable(),
  source: z.enum(['manual', 'state_rule']),
  ruleKey: z.string().nullable(),
  createdAt: z.number(),
  matterTitle: z.string().nullable(),
  courtNumber: z.string().nullable(),
})
export type Task = z.infer<typeof taskSchema>

export type TaskInput = { matterId: string | null; title: string; detail: string | null; dueOn: number | null }
export const taskViews = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' },
] as const
export type TaskViewId = (typeof taskViews)[number]['id']
export const isTaskView = (value: unknown): value is TaskViewId => taskViews.some((v) => v.id === value)
