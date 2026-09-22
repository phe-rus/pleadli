import * as z from 'zod'

export const bondStatuses = [
  { value: 'active', label: 'Active' },
  { value: 'discharged', label: 'Discharged' },
  { value: 'forfeited', label: 'Forfeited' },
] as const

export function bondStatusLabel(status: string) {
  return bondStatuses.find((s) => s.value === status)?.label ?? status
}

export const bondSchema = z.object({
  id: z.string(),
  personId: z.string(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
  custodyId: z.string().nullable(),
  caseId: z.string().nullable(),
  caseReference: z.string().nullable(),
  lockUpSerialNumber: z.string().nullable(),
  withSurety: z.boolean(),
  suretyName: z.string().nullable(),
  suretyContact: z.string().nullable(),
  reportingSchedule: z.string().nullable(),
  officerId: z.string().nullable(),
  officerName: z.string().nullable(),
  officerRank: z.string().nullable(),
  status: z.string(),
  grantedAt: z.number(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Bond = z.infer<typeof bondSchema>

export const createBondSchema = z.object({
  personId: z.string().min(1, 'Person is required.'),
  custodyId: z.string().nullable(),
  caseId: z.string().nullable(),
  lockUpSerialNumber: z.string(),
  withSurety: z.boolean(),
  suretyName: z.string(),
  suretyContact: z.string(),
  reportingSchedule: z.string(),
  officerId: z.string().nullable(),
  officerName: z.string(),
  officerRank: z.string(),
  status: z.string().min(1, 'Status is required.'),
  grantedAt: z.number(),
  notes: z.string(),
})

export type CreateBondInput = z.infer<typeof createBondSchema>

export function bondPersonName(bond: Bond) {
  return [bond.personLastName, bond.personFirstName, bond.personOtherNames].filter(Boolean).join(', ')
}
