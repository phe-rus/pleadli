import * as z from 'zod'

// Mirrors docs/dpp/PRODUCT.md §Decisions & Reviews's confirmed status
// buckets — a cached queue-bucket on the file, not the audit trail itself
// (see features/decisions for that).
export const fileStatuses = [
  { value: 'under_review', label: 'Under review' },
  { value: 'sanctioned', label: 'Sanctioned' },
  { value: 'declined', label: 'Declined' },
  { value: 'diverted', label: 'Diverted' },
  { value: 'returned_for_investigation', label: 'Returned for further investigation' },
  { value: 'taken_over', label: 'Taken over' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'plea_bargained', label: 'Plea bargained' },
] as const

export function fileStatusLabel(status: string) {
  return fileStatuses.find((s) => s.value === status)?.label ?? status
}

export const prosecutionFileSchema = z.object({
  id: z.string(),
  odppRegistrationNumber: z.string().nullable(),
  title: z.string(),
  policeStation: z.string().nullable(),
  policeReference: z.string().nullable(),
  courtCaseNumber: z.string().nullable(),
  currentStatus: z.string(),
  receivedAt: z.number(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type ProsecutionFile = z.infer<typeof prosecutionFileSchema>

export const createProsecutionFileSchema = z.object({
  odppRegistrationNumber: z.string(),
  title: z.string().min(1, 'A short title for the file is required.'),
  policeStation: z.string(),
  policeReference: z.string(),
  receivedAt: z.number(),
  materialSummary: z.string(),
  notes: z.string(),
})

export type CreateProsecutionFileInput = z.infer<typeof createProsecutionFileSchema>

export const updateProsecutionFileSchema = z.object({
  odppRegistrationNumber: z.string(),
  title: z.string().min(1, 'A short title for the file is required.'),
  policeStation: z.string(),
  policeReference: z.string(),
  courtCaseNumber: z.string(),
  notes: z.string(),
})

export type UpdateProsecutionFileInput = z.infer<typeof updateProsecutionFileSchema>

export const filePersonRoles = [
  { value: 'accused', label: 'Accused' },
  { value: 'complainant', label: 'Complainant / victim' },
  { value: 'witness', label: 'Witness' },
] as const

export const prosecutionFilePersonSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  personId: z.string(),
  role: z.string(),
  createdAt: z.number(),
  personFirstName: z.string(),
  personLastName: z.string(),
  personOtherNames: z.string().nullable(),
})

export type ProsecutionFilePerson = z.infer<typeof prosecutionFilePersonSchema>

export function personFullNameForRole(link: Pick<ProsecutionFilePerson, 'personFirstName' | 'personLastName' | 'personOtherNames'>) {
  return [link.personLastName, link.personFirstName, link.personOtherNames].filter(Boolean).join(', ')
}
