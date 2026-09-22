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

/** Why a sitting did not go ahead. These are the fields the Auditor-General's
 * review found missing from the file; each one is a choice, never free text. */
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

export const sittingStatusLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  held: 'Held',
  adjourned: 'Adjourned',
  cancelled: 'Cancelled',
}

export const sittingSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  scheduledAt: z.number(),
  purpose: z.string(),
  courtroom: z.string().nullable(),
  status: z.string(),
  outcome: z.string().nullable(),
  closedAt: z.number().nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
})
export type Sitting = z.infer<typeof sittingSchema>

export const adjournmentSchema = z.object({
  id: z.string(),
  sittingId: z.string(),
  caseId: z.string(),
  reason: z.string(),
  responsible: z.string(),
  note: z.string().nullable(),
  nextDate: z.number().nullable(),
  nextSittingId: z.string().nullable(),
  recordedAt: z.number(),
})
export type Adjournment = z.infer<typeof adjournmentSchema>

export const causeListRowSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  scheduledAt: z.number(),
  purpose: z.string(),
  courtroom: z.string().nullable(),
  status: z.string(),
  outcome: z.string().nullable(),
  courtNumber: z.string(),
  caseTitle: z.string(),
  offence: z.string().nullable(),
  accused: z.string().nullable(),
  hasRemand: z.boolean(),
  adjournments: z.number(),
})
export type CauseListRow = z.infer<typeof causeListRowSchema>

export const adjournedSchema = z.object({ adjournment: adjournmentSchema, nextSitting: sittingSchema.nullable() })

export type SittingInput = { scheduledAt: number; purpose: string; courtroom: string | null; note: string | null }
export type AdjournInput = { reason: string; responsible: string; note: string | null; nextDate: number | null; nextPurpose: string | null }
