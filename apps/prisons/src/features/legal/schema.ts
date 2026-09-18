import * as z from 'zod'

export const diaryEntrySchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  prisonerName: z.string(),
  courtReference: z.string().nullable(),
  productionDate: z.number(),
  purpose: z.string().nullable(),
  productionMethod: z.string(),
  state: z.string(),
  outcome: z.string().nullable(),
})

export type DiaryEntry = z.infer<typeof diaryEntrySchema>

export const thresholdRowSchema = z.object({
  prisonerId: z.string(),
  prisonerName: z.string(),
  admittedAt: z.number(),
  highCourtOnly: z.boolean(),
  daysHeld: z.number(),
  thresholdDays: z.number(),
  mandatoryBailOn: z.number(),
  daysRemaining: z.number(),
  lastProducedAt: z.number().nullable(),
  nextProductionAt: z.number().nullable(),
})

export type ThresholdRow = z.infer<typeof thresholdRowSchema>

export const sentenceRowSchema = z.object({
  prisonerId: z.string(),
  prisonerName: z.string(),
  termText: z.string(),
  startsOn: z.number(),
  sentenceEndsOn: z.number().nullable(),
  releaseDueOn: z.number().nullable(),
  paroleWindowOpensOn: z.number().nullable(),
  isLife: z.boolean(),
  reviewable: z.boolean(),
})

export type SentenceRow = z.infer<typeof sentenceRowSchema>

export const pendingInstrumentRowSchema = z.object({
  prisonerId: z.string(),
  prisonerName: z.string(),
  kind: z.string(),
  status: z.string(),
  since: z.number(),
})

export type PendingInstrumentRow = z.infer<typeof pendingInstrumentRowSchema>

export const unsentencedRowSchema = z.object({
  prisonerId: z.string(),
  prisonerName: z.string(),
  admittedAt: z.number(),
})

export type UnsentencedRow = z.infer<typeof unsentencedRowSchema>

export const legalOverviewSchema = z.object({
  diary: z.array(diaryEntrySchema),
  thresholds: z.array(thresholdRowSchema),
  sentences: z.array(sentenceRowSchema),
  unsentenced: z.array(unsentencedRowSchema),
  pendingInstruments: z.array(pendingInstrumentRowSchema),
})

export type LegalOverview = z.infer<typeof legalOverviewSchema>
