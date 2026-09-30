import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const purposes = [
  { id: 'mention', get label() { return m["hearing.purpose.mention"]() } },
  { id: 'plea', get label() { return m["hearing.purpose.plea"]() } },
  { id: 'bail_application', get label() { return m["hearing.purpose.bail_application"]() } },
  { id: 'hearing', get label() { return m["hearing.purpose.hearing"]() } },
  { id: 'ruling', get label() { return m["hearing.purpose.ruling"]() } },
  { id: 'judgment', get label() { return m["hearing.purpose.judgment"]() } },
  { id: 'sentencing', get label() { return m["hearing.purpose.sentencing"]() } },
  { id: 'other', get label() { return m["hearing.purpose.other"]() } },
] as const

/** The same reasons and responsible parties the court records, so the two sides
 * describe an adjournment in the same words. */
export const reasons = [
  { id: 'witness_absent', get label() { return m["hearing.reason.witness_absent"]() } },
  { id: 'prisoner_not_produced', get label() { return m["hearing.reason.prisoner_not_produced"]() } },
  { id: 'file_incomplete', get label() { return m["hearing.reason.file_incomplete"]() } },
  { id: 'counsel_absent', get label() { return m["hearing.reason.counsel_absent"]() } },
  { id: 'court_not_sitting', get label() { return m["hearing.reason.court_not_sitting"]() } },
  { id: 'other', get label() { return m["hearing.reason.other"]() } },
] as const

export const responsibleParties = [
  { id: 'prosecution', get label() { return m["hearing.responsible.prosecution"]() } },
  { id: 'defence', get label() { return m["hearing.responsible.defence"]() } },
  { id: 'court', get label() { return m["hearing.responsible.court"]() } },
  { id: 'prisons', get label() { return m["hearing.responsible.prisons"]() } },
  { id: 'police', get label() { return m["hearing.responsible.police"]() } },
  { id: 'witness', get label() { return m["hearing.responsible.witness"]() } },
  { id: 'other', get label() { return m["hearing.responsible.other"]() } },
] as const

const label = (list: readonly { id: string; label: string }[], id: string) => list.find((item) => item.id === id)?.label ?? id
export const purposeLabel = (id: string) => label(purposes, id)
export const reasonLabel = (id: string) => label(reasons, id)
export const responsibleLabel = (id: string) => label(responsibleParties, id)

export const hearingStatusLabels: Record<string, string> = {
  get scheduled() { return m["hearing.status.scheduled"]() },
  get attended() { return m["hearing.status.attended"]() },
  get adjourned() { return m["hearing.status.adjourned"]() },
  get missed() { return m["hearing.status.missed"]() },
  get cancelled() { return m["hearing.status.cancelled"]() },
}

export const hearingSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  at: z.number(),
  purpose: z.string(),
  courtroom: z.string().nullable(),
  status: z.string(),
  outcome: z.string().nullable(),
  adjournReason: z.string().nullable(),
  adjournResponsible: z.string().nullable(),
  nextDate: z.number().nullable(),
  note: z.string().nullable(),
  closedAt: z.number().nullable(),
  createdAt: z.number(),
})
export type Hearing = z.infer<typeof hearingSchema>

export const diaryRowSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  at: z.number(),
  purpose: z.string(),
  courtroom: z.string().nullable(),
  status: z.string(),
  outcome: z.string().nullable(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
  courtName: z.string().nullable(),
  clientName: z.string(),
  clientCustody: z.string().nullable(),
  engagement: z.string(),
})
export type DiaryRow = z.infer<typeof diaryRowSchema>

export const adjournedSchema = z.object({ hearing: hearingSchema, nextHearing: hearingSchema.nullable() })

export type HearingInput = { at: number; purpose: string; courtroom: string | null; note: string | null }
export type AdjournInput = { reason: string; responsible: string; note: string | null; nextDate: number | null; nextPurpose: string | null }
