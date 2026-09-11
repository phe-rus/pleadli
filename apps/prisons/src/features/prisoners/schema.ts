import * as z from 'zod'

export const prisonerStatuses = [
  { value: 'unconvicted', label: 'Unconvicted (Remand)' },
  { value: 'convicted', label: 'Convicted' },
  { value: 'civil', label: 'Civil (debtor)' },
] as const

export function prisonerStatusLabel(status: string) {
  return prisonerStatuses.find((s) => s.value === status)?.label ?? status
}

export const admissionInstrumentTypes = [
  { value: 'commitment', label: 'Commitment' },
  { value: 'remand_warrant', label: 'Remand warrant' },
  { value: 'order_of_detention', label: 'Order of detention' },
  { value: 'warrant_of_conviction', label: 'Warrant of conviction / committal' },
] as const

export function admissionInstrumentLabel(type: string) {
  return admissionInstrumentTypes.find((t) => t.value === type)?.label ?? type
}

export const custodyStatuses = [
  { value: 'in_custody', label: 'In custody' },
  { value: 'released', label: 'Released' },
] as const

export function custodyStatusLabel(status: string) {
  return custodyStatuses.find((s) => s.value === status)?.label ?? status
}

export const prisonerSchema = z.object({
  id: z.string(),
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
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Prisoner = z.infer<typeof prisonerSchema>

export const createPrisonerSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  otherNames: z.string(),
  nationalId: z.string(),
  reference: z.string(),
  status: z.string().min(1),
  admissionInstrumentType: z.string().min(1, 'Admission instrument is required.'),
  admissionAuthority: z.string(),
  admittedAt: z.number(),
  highCourtOnlyOffence: z.boolean(),
  notes: z.string(),
})

export type CreatePrisonerInput = z.infer<typeof createPrisonerSchema>

export const updatePrisonerSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  otherNames: z.string(),
  nationalId: z.string(),
  reference: z.string(),
  status: z.string().min(1),
  highCourtOnlyOffence: z.boolean(),
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
