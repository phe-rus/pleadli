import * as z from 'zod'

// Six real, grounded categories (docs/prisons/RESEARCH.md §9-10, §11.7):
// ordinary gate/reception clearance; legal_advisor (Prisons Act s.64(3): a
// standing entitlement, supervised "within sight but not within hearing");
// personal_doctor (Justice Centres Uganda: the same "not within hearing"
// privacy exception as a legal advisor, distinct from the prison's own
// s.26 medical officer); voluntary_visitor (a real named category —
// lawyers, NGOs, care officers, clergy, religious teachers — distinct from
// an ordinary relative/friend visit); and special_authorization split into
// two tiers that the evidence suggests are genuinely different concepts —
// a timing exception (weekend visits, any visitor) vs. a visitor-category
// exception (researchers specifically, any day), both requiring the
// Commissioner General. `special_authorization` (unsplit) may still
// appear on older records; the label falls back to the raw value for it.
export const visitTypes = [
  { value: 'ordinary', label: 'Ordinary visit' },
  { value: 'legal_advisor', label: 'Legal advisor (s.64(3))' },
  { value: 'personal_doctor', label: 'Personal doctor' },
  { value: 'voluntary_visitor', label: 'Voluntary visitor (NGO, clergy, care officer)' },
  { value: 'special_authorization_weekend', label: 'Special authorization: weekend visit' },
  { value: 'special_authorization_researcher', label: 'Special authorization: researcher' },
] as const

export function visitTypeLabel(value: string) {
  return visitTypes.find((v) => v.value === value)?.label ?? value
}

// Authorization is distinct from attendance: a visit can be authorized and
// not yet have happened, or refused outright.
export const visitStatuses = [
  { value: 'authorized', label: 'Authorized (not yet attended)' },
  { value: 'attended', label: 'Attended' },
  { value: 'denied', label: 'Denied' },
] as const

export function visitStatusLabel(value: string) {
  return visitStatuses.find((v) => v.value === value)?.label ?? value
}

export const visitSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  visitorName: z.string(),
  visitorIdentification: z.string().nullable(),
  visitedAt: z.number(),
  supervisingOfficer: z.string().nullable(),
  notes: z.string().nullable(),
  visitType: z.string(),
  status: z.string(),
  authorizedBy: z.string().nullable(),
  createdAt: z.number(),
})

export type Visit = z.infer<typeof visitSchema>

export const createVisitSchema = z.object({
  prisonerId: z.string().min(1),
  visitorName: z.string().min(1, 'Visitor name is required.'),
  visitorIdentification: z.string(),
  visitedAt: z.number(),
  supervisingOfficer: z.string(),
  notes: z.string(),
  visitType: z.string().min(1, 'Visit type is required.'),
  status: z.string().min(1, 'Status is required.'),
  authorizedBy: z.string(),
})

export type CreateVisitInput = z.infer<typeof createVisitSchema>
