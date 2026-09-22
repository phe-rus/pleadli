import * as z from 'zod'

export const purposes = [
  { id: 'mention', label: 'Mention' },
  { id: 'plea', label: 'Plea' },
  { id: 'bail_application', label: 'Bail application' },
  { id: 'hearing', label: 'Hearing' },
  { id: 'ruling', label: 'Ruling' },
  { id: 'judgment', label: 'Judgment' },
  { id: 'sentencing', label: 'Sentencing' },
  { id: 'other', label: 'Other' },
] as const

/** The same reasons and responsible parties the court records, so the two sides
 * describe an adjournment in the same words. */
export const reasons = [
  { id: 'witness_absent', label: 'Witness absent' },
  { id: 'prisoner_not_produced', label: 'Prisoner not produced' },
  { id: 'file_incomplete', label: 'File incomplete' },
  { id: 'counsel_absent', label: 'Counsel absent' },
  { id: 'court_not_sitting', label: 'Court not sitting' },
  { id: 'other', label: 'Other (say why)' },
] as const

export const responsibleParties = [
  { id: 'prosecution', label: 'Prosecution' },
  { id: 'defence', label: 'Defence' },
  { id: 'court', label: 'The court' },
  { id: 'prisons', label: 'Prisons' },
  { id: 'police', label: 'Police' },
  { id: 'witness', label: 'A witness' },
  { id: 'other', label: 'Other' },
] as const

const label = (list: readonly { id: string; label: string }[], id: string) => list.find((item) => item.id === id)?.label ?? id
export const purposeLabel = (id: string) => label(purposes, id)
export const reasonLabel = (id: string) => label(reasons, id)
export const responsibleLabel = (id: string) => label(responsibleParties, id)

export const hearingStatusLabels: Record<string, string> = { scheduled: 'Listed', attended: 'Attended', adjourned: 'Adjourned', missed: 'Missed', cancelled: 'Cancelled' }

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
