import * as z from 'zod'

// Confirmed real alternative to physical transport (docs/prisons/RESEARCH.md
// §11.2): video-link production from inside the prison, operating at
// 19-21 prisons as of the Commissioner General's own 2024 account.
export const productionMethods = [
  { value: 'physical', label: 'Physical production' },
  { value: 'virtual', label: 'Virtual (video-link)' },
] as const

export function productionMethodLabel(value: string) {
  return productionMethods.find((m) => m.value === value)?.label ?? value
}

export const courtProductionSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  courtReference: z.string().nullable(),
  productionDate: z.number(),
  purpose: z.string().nullable(),
  productionMethod: z.string(),
  createdAt: z.number(),
})

export type CourtProduction = z.infer<typeof courtProductionSchema>

export const createCourtProductionSchema = z.object({
  prisonerId: z.string().min(1),
  courtReference: z.string(),
  productionDate: z.number(),
  purpose: z.string(),
  productionMethod: z.string().min(1, 'Production method is required.'),
})

export type CreateCourtProductionInput = z.infer<typeof createCourtProductionSchema>

export const remandListEntrySchema = z.object({
  prisonerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  admittedAt: z.number(),
  admissionAuthority: z.string().nullable(),
  highCourtOnlyOffence: z.boolean(),
  lastProducedAt: z.number().nullable(),
})

export type RemandListEntry = z.infer<typeof remandListEntrySchema>
