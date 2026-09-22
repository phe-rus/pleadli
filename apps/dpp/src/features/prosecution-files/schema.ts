import * as z from 'zod'

// Mirrors docs/dpp/PRODUCT.md §Decisions & Reviews's confirmed status
// buckets — a cached queue-bucket on the file, not the audit trail itself
// (see features/decisions for that).
export const fileStatuses = [
  { value: 'under_review', label: 'Awaiting decision' },
  { value: 'resubmitted', label: 'Resubmitted by Police' },
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

/** How a status reads at a glance: `open` needs the prosecutor, `waiting` is
 * with Police, `done` has had its charging decision. Colour follows this and
 * never carries the meaning alone. */
export type StatusTone = 'open' | 'waiting' | 'done' | 'stopped'

export function fileStatusTone(status: string): StatusTone {
  if (status === 'under_review' || status === 'resubmitted') return 'open'
  if (status === 'returned_for_investigation') return 'waiting'
  if (status === 'sanctioned' || status === 'plea_bargained') return 'done'
  return 'stopped'
}

/** The slices of the register (server: `view_filter`). Each says what it is,
 * because the same file is in exactly one of them. */
export const fileViews = [
  { id: 'intake', label: 'Intake', about: 'Received, and no review recorded yet.' },
  { id: 'active', label: 'Active reviews', about: 'Awaiting a charging decision, with a review under way or handed back by Police.' },
  { id: 'returned', label: 'Returned to Police', about: 'With Police for further investigation.' },
  { id: 'reopened', label: 'Reopened reviews', about: 'Concluded files brought back for review, with the reason each was reopened.' },
  { id: 'closed', label: 'Closed', about: 'The charging decision has been made.' },
  { id: 'all', label: 'All files', about: 'Every file in the register.' },
] as const

export type FileViewId = (typeof fileViews)[number]['id']

export function isFileView(value: unknown): value is FileViewId {
  return fileViews.some((view) => view.id === value)
}

/** What identifies a file to the person holding it: ODPP number, else Police
 * reference, else the short id. */
export function fileReference(file: Pick<ProsecutionFile, 'id' | 'odppRegistrationNumber' | 'policeReference'>) {
  return file.odppRegistrationNumber || file.policeReference || file.id.slice(0, 8)
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
  policeConnectionId: z.string().nullable(),
})

export type ProsecutionFile = z.infer<typeof prosecutionFileSchema>

export const fileSummarySchema = prosecutionFileSchema.extend({
  awaitingSince: z.number(),
  accused: z.string().nullable(),
  reviewNoteCount: z.number(),
  statementCount: z.number(),
  chargeCount: z.number(),
  decisionCount: z.number(),
  lastDecisionType: z.string().nullable(),
  lastDecisionAt: z.number().nullable(),
  lastActivityAt: z.number(),
  openReviewId: z.string().nullable(),
  openReviewStandard: z.string().nullable(),
  reopened: z.boolean(),
  directionsTotal: z.number(),
  directionsOpen: z.number(),
})

export type FileSummary = z.infer<typeof fileSummarySchema>


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
