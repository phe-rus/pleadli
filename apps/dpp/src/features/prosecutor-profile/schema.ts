import * as z from 'zod'

export const prosecutorProfileSchema = z.object({
  name: z.string(),
  rank: z.string().nullable(),
  isDpp: z.boolean(),
  updatedAt: z.number(),
})

export type ProsecutorProfile = z.infer<typeof prosecutorProfileSchema>

export const saveProsecutorProfileSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  rank: z.string().nullable(),
  isDpp: z.boolean(),
})

export type SaveProsecutorProfileInput = z.infer<typeof saveProsecutorProfileSchema>
