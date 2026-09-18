import * as z from 'zod'

export const reviewNoteSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  statementId: z.string().nullable(),
  evidenceItemId: z.string().nullable(),
  author: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.number(),
})

export type ReviewNote = z.infer<typeof reviewNoteSchema>

export const createReviewNoteSchema = z.object({
  prosecutionFileId: z.string().min(1),
  statementId: z.string().nullable(),
  evidenceItemId: z.string().nullable(),
  author: z.string(),
  note: z.string(),
})

export type CreateReviewNoteInput = z.infer<typeof createReviewNoteSchema>
