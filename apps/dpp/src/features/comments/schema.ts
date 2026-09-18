import * as z from 'zod'

export const commentSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  author: z.string().nullable(),
  body: z.string(),
  createdAt: z.number(),
})

export type Comment = z.infer<typeof commentSchema>

export const createCommentSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  author: z.string(),
  body: z.string().min(1, 'Comment cannot be empty.'),
})

export type CreateCommentInput = z.infer<typeof createCommentSchema>
