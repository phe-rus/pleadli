import * as z from 'zod'

// "in": this prison receives back a prisoner it already has a record for.
// A wholly new arrival still goes through Admission — see
// domain/transfers.rs for why (no cross-installation sync exists).
export const transferDirections = [
  { value: 'out', label: 'Transferred out (to another prison)' },
  { value: 'in', label: 'Received back (from another prison)' },
] as const

export function transferDirectionLabel(direction: string) {
  return transferDirections.find((d) => d.value === direction)?.label ?? direction
}

export const transferSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  direction: z.string(),
  otherPrisonName: z.string().nullable(),
  transferredAt: z.number(),
  orderingAuthority: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Transfer = z.infer<typeof transferSchema>

export const createTransferSchema = z.object({
  prisonerId: z.string().min(1),
  direction: z.string().min(1, 'Direction is required.'),
  otherPrisonName: z.string(),
  transferredAt: z.number(),
  orderingAuthority: z.string(),
  notes: z.string(),
})

export type CreateTransferInput = z.infer<typeof createTransferSchema>
