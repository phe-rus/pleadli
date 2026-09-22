import * as z from 'zod'

export const documentKinds = [
  { id: 'bail_application', label: 'Application for bail' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'list_of_authorities', label: 'List of authorities' },
  { id: 'letter', label: 'Letter' },
  { id: 'advice', label: 'Advice' },
  { id: 'general', label: 'Other document' },
] as const
export const documentKindLabel = (id: string) => documentKinds.find((k) => k.id === id)?.label ?? id

export const documentContentSchema = z.object({
  advocate: z.string(),
  firm: z.string().nullable(),
  heading: z.string(),
  title: z.string(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
  courtName: z.string().nullable(),
  filedWith: z.string().nullable(),
  body: z.string(),
  filedOn: z.string(),
})
export type DocumentContent = z.infer<typeof documentContentSchema>

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

export const documentSchema = z.object({
  id: z.string(),
  matterId: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  reference: z.string().nullable(),
  content: documentContentSchema.nullable(),
  contentSha256: z.string().nullable(),
  intact: z.boolean().nullable(),
  filedOn: z.number().nullable(),
  filedWith: z.string().nullable(),
  filedAt: z.number().nullable(),
  filedBy: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
})
export type LawyerDocument = z.infer<typeof documentSchema>

export type CreateDocumentInput = { matterId: string; kind: string; title: string }
export type UpdateDocumentInput = { title: string; body: string }
