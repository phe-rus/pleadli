import * as z from 'zod'
import { clientSchema } from '../clients/schema'
import { hearingSchema } from '../hearings/schema'
import { taskSchema } from '../tasks/schema'

export const matterViews = [
  { id: 'open', label: 'Open matters', about: 'Every matter you are acting in.' },
  { id: 'no_hearing', label: 'No hearing listed', about: 'Open matters with no hearing in the diary. Each one needs a date.' },
  { id: 'closed', label: 'Closed', about: 'Matters you have finished with.' },
  { id: 'all', label: 'All matters', about: 'Every matter, open or closed.' },
] as const
export type MatterViewId = (typeof matterViews)[number]['id']
export const isMatterView = (value: unknown): value is MatterViewId => matterViews.some((v) => v.id === value)

export const engagements = [
  { id: 'private', label: 'Privately retained' },
  { id: 'state_appointed', label: 'Appointed at the expense of the state' },
  { id: 'pro_bono', label: 'Pro bono' },
  { id: 'legal_aid_clinic', label: 'Through a legal aid clinic' },
] as const
export const engagementLabel = (id: string) => engagements.find((e) => e.id === id)?.label ?? id

export const levels = [
  { id: 'magistrate', label: 'Magistrates court' },
  { id: 'high', label: 'High Court' },
  { id: 'appeal', label: 'Court of Appeal or Supreme Court' },
  { id: 'other', label: 'Other' },
] as const
export const levelLabel = (id: string) => levels.find((l) => l.id === id)?.label ?? id

export const matterSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  title: z.string(),
  ourRef: z.string().nullable(),
  courtNumber: z.string().nullable(),
  courtName: z.string().nullable(),
  courtLevel: z.string().nullable(),
  offence: z.string().nullable(),
  engagement: z.string(),
  appointedOn: z.number().nullable(),
  status: z.string(),
  outcome: z.string().nullable(),
  closedAt: z.number().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Matter = z.infer<typeof matterSchema>

export const matterSummarySchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  title: z.string(),
  ourRef: z.string().nullable(),
  courtNumber: z.string().nullable(),
  courtName: z.string().nullable(),
  courtLevel: z.string().nullable(),
  offence: z.string().nullable(),
  engagement: z.string(),
  status: z.string(),
  outcome: z.string().nullable(),
  nextHearingAt: z.number().nullable(),
  openTasks: z.number(),
  createdAt: z.number(),
})
export type MatterSummary = z.infer<typeof matterSummarySchema>

export const matterNoteSchema = z.object({ id: z.string(), matterId: z.string(), at: z.number(), body: z.string(), createdAt: z.number(), updatedAt: z.number() })
export type MatterNote = z.infer<typeof matterNoteSchema>

export const timeEntrySchema = z.object({
  id: z.string(),
  matterId: z.string(),
  workedOn: z.number(),
  minutes: z.number(),
  description: z.string(),
  createdAt: z.number(),
  matterTitle: z.string().nullable(),
  courtNumber: z.string().nullable(),
  engagement: z.string().nullable(),
})
export type TimeEntry = z.infer<typeof timeEntrySchema>

export const documentSummarySchema = z.object({
  id: z.string(),
  matterId: z.string(),
  kind: z.string(),
  title: z.string(),
  status: z.string(),
  reference: z.string().nullable(),
  filedOn: z.number().nullable(),
  updatedAt: z.number(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
})
export type DocumentSummary = z.infer<typeof documentSummarySchema>

export const pleaSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  status: z.enum(['considering', 'negotiating', 'agreed', 'confirmed', 'abandoned']),
  summary: z.string().nullable(),
  explainedOn: z.number().nullable(),
  explainedBy: z.enum(['advocate', 'justice_of_the_peace']).nullable(),
  signedOn: z.number().nullable(),
  confirmedOn: z.number().nullable(),
  abandonedReason: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Plea = z.infer<typeof pleaSchema>

export const matterDetailSchema = z.object({
  matter: matterSchema,
  client: clientSchema,
  hearings: z.array(hearingSchema),
  tasks: z.array(taskSchema),
  notes: z.array(matterNoteSchema),
  time: z.array(timeEntrySchema),
  documents: z.array(documentSummarySchema),
  plea: pleaSchema.nullable(),
})
export type MatterDetail = z.infer<typeof matterDetailSchema>

export type MatterInput = {
  clientId: string
  title: string
  ourRef: string | null
  courtNumber: string | null
  courtName: string | null
  courtLevel: string | null
  offence: string | null
  engagement: string
  appointedOn: number | null
  notes: string | null
}

export const matterFormSchema = z.object({
  clientId: z.string().min(1, 'Choose the client.'),
  title: z.string().trim().min(1, 'A matter needs a title, for example the State against your client.'),
  engagement: z.string().min(1, 'Say how you came to act.'),
})

export const matterLabel = (m: { courtNumber: string | null; title: string }) => (m.courtNumber ? `${m.courtNumber}, ${m.title}` : m.title)
