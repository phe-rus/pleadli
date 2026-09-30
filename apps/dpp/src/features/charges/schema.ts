import * as z from 'zod'
import * as m from '@/paraglide/messages'

export const chargeSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  accusedPersonId: z.string().nullable(),
  offence: z.string(),
  statutorySection: z.string().nullable(),
  particulars: z.string().nullable(),
  createdAt: z.number(),
})

export type Charge = z.infer<typeof chargeSchema>

export const createChargeSchema = z.object({
  prosecutionFileId: z.string().min(1),
  accusedPersonId: z.string().nullable(),
  offence: z.string().min(1, { error: () => m["charge.form.offence_required"]() }),
  statutorySection: z.string(),
  particulars: z.string(),
})

export type CreateChargeInput = z.infer<typeof createChargeSchema>
