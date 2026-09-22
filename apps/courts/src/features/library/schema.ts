import * as z from 'zod'

export const libraryKinds = [
  { id: 'statute', label: 'Statute' },
  { id: 'guideline', label: 'Guideline' },
  { id: 'authority', label: 'Authority' },
  { id: 'practice_direction', label: 'Practice direction' },
  { id: 'note', label: 'Note' },
] as const
export const libraryKindLabel = (id: string) => libraryKinds.find((k) => k.id === id)?.label ?? id

export const librarySummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  citation: z.string().nullable(),
  source: z.string().nullable(),
  licence: z.string().nullable(),
  size: z.number(),
  snippet: z.string().nullable(),
  updatedAt: z.number(),
})
export type LibrarySummary = z.infer<typeof librarySummarySchema>

export const libraryItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  citation: z.string().nullable(),
  source: z.string().nullable(),
  licence: z.string().nullable(),
  body: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type LibraryItem = z.infer<typeof libraryItemSchema>

export type LibraryInput = { kind: string; title: string; citation: string | null; source: string | null; licence: string | null; body: string }
