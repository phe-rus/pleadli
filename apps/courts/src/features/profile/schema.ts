import * as z from 'zod'

export const benchProfileSchema = z.object({
  name: z.string(),
  title: z.string().nullable(),
  courtName: z.string().nullable(),
  courtLevel: z.string(),
  updatedAt: z.number(),
})
export type BenchProfile = z.infer<typeof benchProfileSchema>

export type SaveProfileInput = { name: string; title: string | null; courtName: string | null; courtLevel: string }

export const saveProfileSchema = z.object({
  name: z.string().trim().min(1, 'Your name is needed: an order is signed with it.'),
})
