import * as m from '@/paraglide/messages'
import * as z from 'zod'
import { matterClocksSchema } from '../clocks'
import { filingSchema } from '../filings/schema'
import { clientSchema } from '../clients/schema'
import { hearingSchema } from '../hearings/schema'
import { taskSchema } from '../tasks/schema'

export const matterViews = [
  { id: 'board', get label() { return m["matter.view.board"]() }, get about() { return m["matter.view.board_about"]() } },
  { id: 'open', get label() { return m["matter.view.open"]() }, get about() { return m["matter.view.open_about"]() } },
  { id: 'no_hearing', get label() { return m["matter.view.no_hearing"]() }, get about() { return m["matter.view.no_hearing_about"]() } },
  { id: 'closed', get label() { return m["matter.view.closed"]() }, get about() { return m["matter.view.closed_about"]() } },
  { id: 'all', get label() { return m["matter.view.all"]() }, get about() { return m["matter.view.all_about"]() } },
] as const
export type MatterViewId = (typeof matterViews)[number]['id']
export const isMatterView = (value: unknown): value is MatterViewId => matterViews.some((v) => v.id === value)

export const engagements = [
  { id: 'private', get label() { return m["engagement.private"]() } },
  { id: 'state_appointed', get label() { return m["engagement.state_appointed"]() } },
  { id: 'pro_bono', get label() { return m["engagement.pro_bono"]() } },
  { id: 'legal_aid_clinic', get label() { return m["engagement.legal_aid_clinic"]() } },
] as const
export const engagementLabel = (id: string) => engagements.find((e) => e.id === id)?.label ?? id

export const levels = [
  { id: 'magistrate', get label() { return m["court_level.magistrate"]() } },
  { id: 'high', get label() { return m["court_level.high"]() } },
  { id: 'appeal', get label() { return m["court_level.appeal"]() } },
  { id: 'other', get label() { return m["court_level.other"]() } },
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
  remandedOn: z.number().nullable().catch(null),
  committedOn: z.number().nullable().catch(null),
  matterType: z.string(),
  stage: z.string(),
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
  matterType: z.string(),
  stage: z.string(),
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

export const partyRoles = ['opposing_party', 'opposing_counsel', 'co_party', 'witness', 'complainant', 'other'] as const
export type PartyRole = (typeof partyRoles)[number]

export const partySchema = z.object({
  id: z.string(),
  matterId: z.string(),
  role: z.enum(partyRoles),
  name: z.string(),
  organisation: z.string().nullable(),
  contact: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})
export type Party = z.infer<typeof partySchema>
export type PartyInput = { role: PartyRole; name: string; organisation: string | null; contact: string | null; notes: string | null }

export const conflictHitSchema = z.object({
  role: z.string(),
  name: z.string(),
  matterId: z.string().nullable(),
  matterTitle: z.string().nullable(),
  matterStatus: z.string().nullable(),
  strong: z.boolean(),
})
export type ConflictHit = z.infer<typeof conflictHitSchema>

export const matterDetailSchema = z.object({
  matter: matterSchema,
  client: clientSchema,
  hearings: z.array(hearingSchema),
  tasks: z.array(taskSchema),
  notes: z.array(matterNoteSchema),
  time: z.array(timeEntrySchema),
  documents: z.array(documentSummarySchema),
  plea: pleaSchema.nullable(),
  parties: z.array(partySchema),
  clocks: matterClocksSchema,
  filings: z.array(filingSchema),
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
  /** Only when opening: a matter's kind is fixed after. */
  matterType?: string
}

export const matterFormSchema = () =>
  z.object({
    clientId: z.string().min(1, m["matter.form.client_required"]()),
    title: z.string().trim().min(1, m["matter.form.title_required"]()),
    engagement: z.string().min(1, m["matter.form.engagement_required"]()),
    matterType: z.string().min(1, m["matter.form.type_required"]()),
  })

export const matterLabel = (m: { courtNumber: string | null; title: string }) => (m.courtNumber ? `${m.courtNumber}, ${m.title}` : m.title)
