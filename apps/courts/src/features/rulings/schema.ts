import * as z from 'zod'

export const rulingKinds = [
  { id: 'ruling', label: 'Ruling' },
  { id: 'judgment', label: 'Judgment' },
] as const
export const rulingKindLabel = (id: string) => rulingKinds.find((k) => k.id === id)?.label ?? id

export const rulingContentSchema = z.object({
  court: z.string(),
  heading: z.string(),
  title: z.string(),
  caseNumber: z.string(),
  caseTitle: z.string(),
  body: z.string(),
  deliveredOn: z.string(),
  signatory: z.string(),
  signatoryTitle: z.string().nullable(),
})
export type RulingContent = z.infer<typeof rulingContentSchema>

export const rulingSummarySchema = z.object({
  id: z.string(),
  caseId: z.string(),
  kind: z.string(),
  title: z.string(),
  status: z.string(),
  reference: z.string().nullable(),
  reservedOn: z.number().nullable(),
  deliveredOn: z.number().nullable(),
  updatedAt: z.number(),
  courtNumber: z.string(),
  caseTitle: z.string(),
})
export type RulingSummary = z.infer<typeof rulingSummarySchema>

export const rulingSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  sittingId: z.string().nullable(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  reservedOn: z.number().nullable(),
  status: z.string(),
  reference: z.string().nullable(),
  content: rulingContentSchema.nullable(),
  contentSha256: z.string().nullable(),
  intact: z.boolean().nullable(),
  deliveredOn: z.number().nullable(),
  deliveredAt: z.number().nullable(),
  deliveredBy: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  courtNumber: z.string(),
  caseTitle: z.string(),
})
export type Ruling = z.infer<typeof rulingSchema>

export type CreateRulingInput = { caseId: string; sittingId: string | null; kind: string; title: string; reservedOn: number | null }
export type UpdateRulingInput = { title: string; body: string; reservedOn: number | null }
