import * as z from 'zod'

const labeledCountSchema = z.object({
  label: z.string(),
  count: z.number(),
})

export type LabeledCount = z.infer<typeof labeledCountSchema>

// Owns nothing of its own — every field here is read live from existing
// tables (docs/police/PRODUCT.md: "Reports & Analytics... owns nothing,
// pure aggregation"). Timestamps are unbucketed; the frontend buckets
// them with the same `weeklyBuckets` helper Overview already uses.
export const reportsSummarySchema = z.object({
  stationDiaryTimestamps: z.array(z.number()),
  incidentTimestamps: z.array(z.number()),
  caseTimestamps: z.array(z.number()),
  statementTimestamps: z.array(z.number()),
  custodyTimestamps: z.array(z.number()),
  bondTimestamps: z.array(z.number()),
  exhibitTimestamps: z.array(z.number()),
  chargeSheetTimestamps: z.array(z.number()),
  referralTimestamps: z.array(z.number()),

  caseStatusCounts: z.array(labeledCountSchema),
  custodyStatusCounts: z.array(labeledCountSchema),
  bondStatusCounts: z.array(labeledCountSchema),
  exhibitStatusCounts: z.array(labeledCountSchema),
  referralStatusCounts: z.array(labeledCountSchema),
  referralDestinationCounts: z.array(labeledCountSchema),
  topOffences: z.array(labeledCountSchema),
})

export type ReportsSummary = z.infer<typeof reportsSummarySchema>
