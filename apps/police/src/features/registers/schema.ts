import * as z from 'zod'

export const registerKinds = ['sd', 'crb'] as const
export type RegisterKind = (typeof registerKinds)[number]

export const registerNumberSchema = z.object({
  number: z.number(),
  year: z.number(),
  reference: z.string(),
})

export type RegisterNumber = z.infer<typeof registerNumberSchema>

/** How a numbered diary entry is cited: `SD 12/2026`. */
export function diaryCitation(entry: { entryNumber: number | null; entryYear: number | null }) {
  return entry.entryNumber && entry.entryYear ? `SD ${entry.entryNumber}/${entry.entryYear}` : null
}
