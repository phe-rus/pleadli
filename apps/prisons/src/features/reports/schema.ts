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
})

export type ReportsSummary = z.infer<typeof reportsSummarySchema>
