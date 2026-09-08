import * as z from 'zod'

export const personSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.number(),
})

export type Person = z.infer<typeof personSchema>

export const createPersonSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  otherNames: z.string(),
  phone: z.string(),
  nationalId: z.string(),
  address: z.string(),
})

export type CreatePersonInput = z.infer<typeof createPersonSchema>
