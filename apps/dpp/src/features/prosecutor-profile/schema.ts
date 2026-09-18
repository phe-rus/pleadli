import * as z from 'zod'

export const prosecutorProfileSchema = z.object({
  name: z.string(),
  rank: z.string().nullable(),
  updatedAt: z.number(),
})

export type ProsecutorProfile = z.infer<typeof prosecutorProfileSchema>

export const saveProsecutorProfileSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  rank: z.string().nullable(),
})

export type SaveProsecutorProfileInput = z.infer<typeof saveProsecutorProfileSchema>
