import * as z from 'zod'
import { m } from '@/paraglide/messages'

// Confirmed real alternative to physical transport (docs/prisons/RESEARCH.md
// §11.2): video-link production from inside the prison, operating at
// 19-21 prisons as of the Commissioner General's own 2024 account.
export const productionMethods = [
  { value: 'physical', get label() { return m.court_productions_physical_production() } },
  { value: 'virtual', get label() { return m.court_productions_virtual_video_link() } },
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
  productionMethod: z.string().min(1, { error: () => m.validation_production_method_required() }),
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
  { value: 'remanded', get label() { return m.court_productions_remanded() }, needsDate: true },
  { value: 'adjourned', get label() { return m.court_productions_adjourned() }, needsDate: true },
  { value: 'committed_for_trial', get label() { return m.court_productions_committed_for_trial() }, needsDate: true },
  { value: 'bail_granted', get label() { return m.court_productions_bail_granted() }, needsDate: false },
  { value: 'acquitted', get label() { return m.court_productions_acquitted_or_discharged() }, needsDate: false },
  { value: 'convicted', get label() { return m.court_productions_convicted() }, needsDate: false },
  { value: 'not_produced', get label() { return m.court_productions_not_produced() }, needsDate: false },
] as const

export function courtOutcomeLabel(value: string | null) {
  return courtOutcomes.find((o) => o.value === value)?.label ?? value ?? ''
}

export const recordCourtOutcomeSchema = z.object({
  productionId: z.string().min(1),
  outcome: z.string().min(1, { error: () => m.validation_choose_court_decision() }),
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
