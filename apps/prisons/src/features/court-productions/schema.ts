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
  state: z.string(),
  outcome: z.string().nullable(),
  outcomeNotes: z.string().nullable(),
  nextDate: z.number().nullable(),
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

export const courtOutcomes = [
  { value: 'remanded', label: 'Remanded', needsDate: true },
  { value: 'adjourned', label: 'Adjourned', needsDate: true },
  { value: 'committed_for_trial', label: 'Committed for trial', needsDate: true },
  { value: 'bail_granted', label: 'Bail granted', needsDate: false },
  { value: 'acquitted', label: 'Acquitted or discharged', needsDate: false },
  { value: 'convicted', label: 'Convicted', needsDate: false },
  { value: 'not_produced', label: 'Not produced', needsDate: false },
] as const

export function courtOutcomeLabel(value: string | null) {
  return courtOutcomes.find((o) => o.value === value)?.label ?? value ?? ''
}

export const recordCourtOutcomeSchema = z.object({
  productionId: z.string().min(1),
  outcome: z.string().min(1, 'Choose what the court decided.'),
  notes: z.string(),
  nextDate: z.number().nullable(),
})

export type RecordCourtOutcomeInput = z.infer<typeof recordCourtOutcomeSchema>

export const courtOutcomeResultSchema = z.object({
  production: courtProductionSchema,
  nextProduction: courtProductionSchema.nullable(),
  followUp: z.enum(['discharge', 'sentence']).nullable(),
})

export type CourtOutcomeResult = z.infer<typeof courtOutcomeResultSchema>
