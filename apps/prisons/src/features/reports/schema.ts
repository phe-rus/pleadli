import * as z from 'zod'

export const labeledCountSchema = z.object({
  label: z.string(),
  count: z.number(),
})

export const reportsSummarySchema = z.object({
  admissionTimestamps: z.array(z.number()),
  releaseTimestamps: z.array(z.number()),
  transferTimestamps: z.array(z.number()),
  visitTimestamps: z.array(z.number()),
  courtProductionTimestamps: z.array(z.number()),
  healthEventTimestamps: z.array(z.number()),
  prisonerCategoryCounts: z.array(labeledCountSchema),
  custodyStatusCounts: z.array(labeledCountSchema),
  releaseTypeCounts: z.array(labeledCountSchema),
  transferDirectionCounts: z.array(labeledCountSchema),
  healthEventTypeCounts: z.array(labeledCountSchema),
  admissionYearCounts: z.array(labeledCountSchema),
  admissionMonthCounts: z.array(labeledCountSchema),
  prisonerAgeGroupCounts: z.array(labeledCountSchema),
  prisonerSexCounts: z.array(labeledCountSchema),
  prisonerEducationCounts: z.array(labeledCountSchema),
  prisonerNationalityCounts: z.array(labeledCountSchema),
  prisonerOffenceTypeCounts: z.array(labeledCountSchema),
  prisonerSentenceCategoryCounts: z.array(labeledCountSchema),
  facilityPopulationCounts: z.array(labeledCountSchema),
  facilityInCustodyCounts: z.array(labeledCountSchema),
})

export type ReportsSummary = z.infer<typeof reportsSummarySchema>
