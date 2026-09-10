import * as z from 'zod'

// The obvious record-lifecycle states, not an invented legal procedure —
// same reasoning already applied to Bond's status field. The register
// fields themselves (identification mark, recovered-from location,
// handed-over-by, witnesses, receiving officer, storage location) mirror
// docs/police/research findings on the 2021 Exhibit Management Guidelines
// and UPF's PF17A "Exhibit" form — see the migration's own comment.
export const exhibitStatuses = [
  { value: 'in_storage', label: 'In storage' },
  { value: 'released', label: 'Released' },
  { value: 'disposed', label: 'Disposed' },
] as const

export function exhibitStatusLabel(status: string) {
  return exhibitStatuses.find((s) => s.value === status)?.label ?? status
}

export const exhibitSchema = z.object({
  id: z.string(),
  caseId: z.string().nullable(),
  caseReference: z.string().nullable(),
  incidentId: z.string().nullable(),
  personId: z.string().nullable(),
  personFirstName: z.string().nullable(),
  personLastName: z.string().nullable(),
  personOtherNames: z.string().nullable(),
  description: z.string(),
  identificationMark: z.string().nullable(),
  recoveredAt: z.number(),
  recoveredFromLocation: z.string().nullable(),
  handedOverBy: z.string().nullable(),
  witnesses: z.string().nullable(),
  receivingOfficerName: z.string().nullable(),
  storageLocation: z.string().nullable(),
  status: z.string(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Exhibit = z.infer<typeof exhibitSchema>

export const createExhibitSchema = z.object({
  caseId: z.string().nullable(),
  incidentId: z.string().nullable(),
  personId: z.string().nullable(),
  description: z.string().min(1, 'Description is required.'),
  identificationMark: z.string(),
  recoveredAt: z.number(),
  recoveredFromLocation: z.string(),
  handedOverBy: z.string(),
  witnesses: z.string(),
  receivingOfficerName: z.string(),
  storageLocation: z.string(),
  status: z.string().min(1, 'Status is required.'),
  notes: z.string(),
})

export type CreateExhibitInput = z.infer<typeof createExhibitSchema>

export function exhibitPersonName(exhibit: Pick<Exhibit, 'personFirstName' | 'personLastName' | 'personOtherNames'>) {
  if (!exhibit.personFirstName) return null
  return [exhibit.personLastName, exhibit.personFirstName, exhibit.personOtherNames].filter(Boolean).join(', ')
}

export const exhibitMovementSchema = z.object({
  id: z.string(),
  exhibitId: z.string(),
  movedAt: z.number(),
  location: z.string(),
  custodianName: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.number(),
})

export type ExhibitMovement = z.infer<typeof exhibitMovementSchema>

export const createExhibitMovementSchema = z.object({
  movedAt: z.number(),
  location: z.string().min(1, 'Location is required.'),
  custodianName: z.string(),
  reason: z.string(),
})

export type CreateExhibitMovementInput = z.infer<typeof createExhibitMovementSchema>
