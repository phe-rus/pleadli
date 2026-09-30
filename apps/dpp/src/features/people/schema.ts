import * as z from 'zod'
import * as m from '@/paraglide/messages'

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
  firstName: z.string().min(1, { error: () => m["person.form.first_name_required"]() }),
  lastName: z.string().min(1, { error: () => m["person.form.last_name_required"]() }),
  otherNames: z.string(),
  phone: z.string(),
  nationalId: z.string(),
  address: z.string(),
})

export type CreatePersonInput = z.infer<typeof createPersonSchema>

export function personFullName(person: Pick<Person, 'firstName' | 'lastName' | 'otherNames'>) {
  return [person.lastName, person.firstName, person.otherNames].filter(Boolean).join(', ')
}
