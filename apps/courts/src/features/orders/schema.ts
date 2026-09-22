import * as z from 'zod'

export const orderKinds = [
  { id: 'adjournment', label: 'Order of adjournment', about: 'Records the next date and why the matter was adjourned.' },
  { id: 'remand', label: 'Remand order', about: 'Commits an accused person to custody until a date.' },
  { id: 'release', label: 'Release order', about: 'Directs that an accused person be released from custody.' },
  { id: 'general', label: 'General order', about: 'Any other order or direction, in the court’s own words.' },
] as const
export const orderKindLabel = (id: string) => orderKinds.find((k) => k.id === id)?.label ?? id

export const orderFieldsSchema = z.object({
  accused: z.string().nullish(),
  prison: z.string().nullish(),
  remandUntil: z.number().nullish(),
  nextDate: z.number().nullish(),
  nextPurpose: z.string().nullish(),
  reason: z.string().nullish(),
  body: z.string().nullish(),
})
export type OrderFields = z.infer<typeof orderFieldsSchema>

export const orderContentSchema = z.object({
  court: z.string(),
  heading: z.string(),
  caseNumber: z.string(),
  caseTitle: z.string(),
  paragraphs: z.array(z.string()),
  date: z.string(),
  signatory: z.string(),
  signatoryTitle: z.string().nullable(),
})
export type OrderContent = z.infer<typeof orderContentSchema>

export const orderSummarySchema = z.object({
  id: z.string(),
  caseId: z.string(),
  kind: z.string(),
  title: z.string(),
  status: z.string(),
  reference: z.string().nullable(),
  issuedAt: z.number().nullable(),
  updatedAt: z.number(),
  courtNumber: z.string(),
  caseTitle: z.string(),
})
export type OrderSummary = z.infer<typeof orderSummarySchema>

export const orderSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  sittingId: z.string().nullable(),
  kind: z.string(),
  title: z.string(),
  fields: orderFieldsSchema,
  status: z.string(),
  reference: z.string().nullable(),
  content: orderContentSchema.nullable(),
  contentSha256: z.string().nullable(),
  intact: z.boolean().nullable(),
  issuedAt: z.number().nullable(),
  issuedBy: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  courtNumber: z.string(),
  caseTitle: z.string(),
})
export type Order = z.infer<typeof orderSchema>

export type CreateOrderInput = { caseId: string; sittingId: string | null; kind: string; title: string | null; fields: OrderFields }
export type UpdateOrderInput = { title: string | null; fields: OrderFields }
