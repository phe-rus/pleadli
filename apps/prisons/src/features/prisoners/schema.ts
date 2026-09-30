import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const prisonerStatuses = [
  { value: 'unconvicted', get label() { return m.prisoners_unconvicted_remand() } },
  { value: 'convicted', get label() { return m.prisoners_convicted() } },
  { value: 'civil', get label() { return m.prisoners_civil_debtor() } },
] as const

export function prisonerStatusLabel(status: string) {
  return prisonerStatuses.find((s) => s.value === status)?.label ?? status
}

export const admissionInstrumentTypes = [
  { value: 'commitment', get label() { return m.prisoners_commitment() } },
  { value: 'remand_warrant', get label() { return m.prisoners_remand_warrant() } },
  { value: 'order_of_detention', get label() { return m.prisoners_order_of_detention() } },
  { value: 'warrant_of_conviction', get label() { return m.prisoners_warrant_of_conviction_committal() } },
] as const

export function admissionInstrumentLabel(type: string) {
  return admissionInstrumentTypes.find((t) => t.value === type)?.label ?? type
}

export const custodyStatuses = [
  { value: 'in_custody', get label() { return m.prisoners_in_custody() } },
  { value: 'released', get label() { return m.prisoners_released() } },
  { value: 'transferred_out', get label() { return m.prisoners_transferred_out() } },
] as const

export function custodyStatusLabel(status: string) {
  return custodyStatuses.find((s) => s.value === status)?.label ?? status
}

export const prisonerSexes = [
  { value: 'male', get label() { return m.prisoners_male() } },
  { value: 'female', get label() { return m.prisoners_female() } },
] as const

export const educationLevels = [
  { value: 'none', get label() { return m.prisoners_none() } },
  { value: 'primary', get label() { return m.prisoners_primary() } },
  { value: 'secondary', get label() { return m.prisoners_secondary() } },
  { value: 'tertiary', get label() { return m.prisoners_tertiary() } },
  { value: 'other', get label() { return m.prisoners_other() } },
] as const

export const nationalities = [
  { value: 'ugandan', get label() { return m.prisoners_ugandan() } },
  { value: 'foreign', get label() { return m.prisoners_foreign() } },
] as const

export const pendingDocumentTypes = [
  { value: 'charge_sheet', get label() { return m.prisoners_charge_sheet() } },
  { value: 'committed_warrant', get label() { return m.prisoners_committed_warrant() } },
  { value: 'both', get label() { return m.prisoners_charge_sheet_and_warrant() } },
  { value: 'other', get label() { return m.prisoners_other() } },
] as const

export function pendingDocumentTypeLabel(type: string | null) {
  return pendingDocumentTypes.find((t) => t.value === type)?.label ?? null
}

export const prisonerSchema = z.object({
  id: z.string(),
  episodeId: z.string().nullable().optional(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  nationalId: z.string().nullable(),
  reference: z.string().nullable(),
  status: z.string(),
  admissionInstrumentType: z.string(),
  admissionAuthority: z.string().nullable(),
  admittedAt: z.number(),
  currentStatus: z.string(),
  highCourtOnlyOffence: z.boolean(),
  currentLocation: z.string().nullable(),
  dateOfBirth: z.number().nullable(),
  sex: z.string().nullable(),
  educationLevel: z.string().nullable(),
  nationality: z.string().nullable(),
  offence: z.string().nullable(),
  documentsPending: z.boolean(),
  pendingDocumentType: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
  prisonerNumber: z.string().nullable().optional(),
})

export type Prisoner = z.infer<typeof prisonerSchema>

export const updatePrisonerSchema = z.object({
  firstName: z.string().min(1, { error: () => m.validation_first_name_required() }),
  lastName: z.string().min(1, { error: () => m.validation_last_name_required() }),
  otherNames: z.string(),
  nationalId: z.string(),
  reference: z.string(),
  status: z.string().min(1),
  highCourtOnlyOffence: z.boolean(),
  currentLocation: z.string(),
  dateOfBirth: z.number().nullable(),
  sex: z.string().nullable(),
  educationLevel: z.string().nullable(),
  nationality: z.string().nullable(),
  offence: z.string(),
  documentsPending: z.boolean(),
  pendingDocumentType: z.string().nullable(),
  notes: z.string(),
})

export type UpdatePrisonerInput = z.infer<typeof updatePrisonerSchema>

export function prisonerFullName(prisoner: Pick<Prisoner, 'firstName' | 'lastName' | 'otherNames'>) {
  return [prisoner.lastName, prisoner.firstName, prisoner.otherNames].filter(Boolean).join(', ')
}

/** Constitutional mandatory-bail threshold (Art. 23(6)), NOT the Prisons
 * Act's own unreformed 120/360-day text — see docs/prisons/PRODUCT.md
 * §Custody & Remand tracking for the citation and the discrepancy. */
export function mandatoryBailThresholdDays(highCourtOnlyOffence: boolean) {
  return highCourtOnlyOffence ? 180 : 60
}

export function daysInCustody(admittedAt: number) {
  return Math.floor((Date.now() - admittedAt) / 86_400_000)
}
