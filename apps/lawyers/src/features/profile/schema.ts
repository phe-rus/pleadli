import * as z from 'zod'

export const advocateProfileSchema = z.object({
  name: z.string(),
  firm: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  updatedAt: z.number(),
})
export type AdvocateProfile = z.infer<typeof advocateProfileSchema>

export type SaveProfileInput = { name: string; firm: string | null; phone: string | null; email: string | null }

export const saveProfileSchema = z.object({ name: z.string().trim().min(1, 'Your name is needed: what you file is signed with it.') })
