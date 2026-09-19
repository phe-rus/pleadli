import * as z from 'zod'

// Six real, grounded categories (docs/prisons/RESEARCH.md 9-10, 11.7).
// legal_advisor (Prisons Act s.64(3)) and personal_doctor are seen within
// sight but not within hearing, so their record keeps no content.
// special_authorization_* need the Officer in Charge to approve.
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

export function isPrivilegedType(value: string) {
  return value === 'legal_advisor' || value === 'personal_doctor'
}

export function isSpecialType(value: string) {
  return value.startsWith('special_authorization')
}

export const visitStatuses = [
  { value: 'requested', label: 'Requested' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'checked_in', label: 'At the gate' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'denied', label: 'Refused' },
  { value: 'no_show', label: 'No show' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const legacyStatusLabels: Record<string, string> = { authorized: 'Scheduled', attended: 'Completed' }

export function visitStatusLabel(value: string) {
  return visitStatuses.find((v) => v.value === value)?.label ?? legacyStatusLabels[value] ?? value
}

export function visitStatusVariant(value: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (value) {
    case 'completed':
    case 'attended':
    case 'in_progress':
      return 'default'
    case 'denied':
    case 'no_show':
      return 'destructive'
    case 'checked_in':
    case 'scheduled':
      return 'outline'
    default:
      return 'secondary'
  }
}

export const idTypes = [
  { value: 'national_id', label: 'National ID' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_permit', label: 'Driving permit' },
  { value: 'other', label: 'Other photo ID' },
] as const

export function idTypeLabel(value: string) {
  return idTypes.find((v) => v.value === value)?.label ?? value
}

export const itemDispositions = [
  { value: 'handed_over', label: 'Handed to the prisoner' },
  { value: 'held', label: 'Held at the gate' },
  { value: 'refused', label: 'Refused' },
] as const

export function itemDispositionLabel(value: string) {
  return itemDispositions.find((v) => v.value === value)?.label ?? value
}

export const visitSchema = z.object({
  id: z.string(),
  prisonerId: z.string(),
  visitorId: z.string().nullable(),
  visitorName: z.string(),
  visitorIdentification: z.string().nullable(),
  relationship: z.string().nullable(),
  visitedAt: z.number(),
  durationMinutes: z.number(),
  partySize: z.number(),
  supervisingOfficer: z.string().nullable(),
  notes: z.string().nullable(),
  visitType: z.string(),
  privileged: z.boolean(),
  status: z.string(),
  authorizedBy: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.number().nullable(),
  decisionReason: z.string().nullable(),
  idVerified: z.boolean(),
  searchDone: z.boolean(),
  checkedInAt: z.number().nullable(),
  checkedInBy: z.string().nullable(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  createdAt: z.number(),
})

export type Visit = z.infer<typeof visitSchema>

// The facility-wide visit log shape: a visit joined with its prisoner's name.
export const visitListItemSchema = visitSchema.extend({
  prisonerFirstName: z.string(),
  prisonerLastName: z.string(),
  prisonerOtherNames: z.string().nullable(),
})

export type VisitListItem = z.infer<typeof visitListItemSchema>

export function visitListItemFullName(row: Pick<VisitListItem, 'prisonerFirstName' | 'prisonerLastName' | 'prisonerOtherNames'>) {
  return [row.prisonerFirstName, row.prisonerOtherNames, row.prisonerLastName].filter(Boolean).join(' ')
}

export const visitItemSchema = z.object({
  id: z.string(),
  visitId: z.string(),
  description: z.string(),
  disposition: z.string(),
  createdAt: z.number(),
})

export type VisitItem = z.infer<typeof visitItemSchema>

export const visitorSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  idType: z.string(),
  idNumber: z.string().nullable(),
  phone: z.string().nullable(),
  relationshipDefault: z.string().nullable(),
  createdAt: z.number(),
})

export type Visitor = z.infer<typeof visitorSchema>

export const approvedVisitorSchema = z.object({
  visitorId: z.string(),
  fullName: z.string(),
  idType: z.string(),
  idNumber: z.string().nullable(),
  phone: z.string().nullable(),
  relationship: z.string().nullable(),
  status: z.string(),
  note: z.string().nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: z.number(),
  visitsCompleted: z.number(),
  lastVisitAt: z.number().nullable(),
})

export type ApprovedVisitor = z.infer<typeof approvedVisitorSchema>

export const visitRulesSchema = z.object({
  maxVisitorsPerVisit: z.number(),
  maxVisitorsPerPrisonerPerDay: z.number(),
  visitingDays: z.array(z.number()),
  opensMinutes: z.number(),
  closesMinutes: z.number(),
  defaultDurationMinutes: z.number(),
  updatedAt: z.number().nullable(),
  updatedBy: z.string().nullable(),
})

export type VisitRules = z.infer<typeof visitRulesSchema>
export type SaveVisitRulesInput = Omit<VisitRules, 'updatedAt' | 'updatedBy'>

export const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
] as const

export function minutesToTime(minutes: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

export function timeToMinutes(value: string) {
  const [h, m] = value.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Whether a moment falls outside the facility's visiting days and hours,
 * in the browser's own zone, which is the officer's wall clock. */
export function isOutsideVisitingHours(rules: VisitRules, at: number) {
  const date = new Date(at)
  const day = date.getDay() === 0 ? 7 : date.getDay()
  const minutes = date.getHours() * 60 + date.getMinutes()
  return !rules.visitingDays.includes(day) || minutes < rules.opensMinutes || minutes >= rules.closesMinutes
}

export const newVisitorSchema = z.object({
  fullName: z.string().min(1, 'Enter the visitor’s full name.'),
  idType: z.string(),
  idNumber: z.string().min(1, 'Every visitor needs a photographic ID.'),
  phone: z.string(),
  relationship: z.string(),
})

export type NewVisitorInput = z.infer<typeof newVisitorSchema>

export const createVisitSchema = z.object({
  prisonerId: z.string().min(1),
  visitorId: z.string().optional(),
  newVisitor: newVisitorSchema.optional(),
  visitorName: z.string().optional(),
  visitorIdentification: z.string().optional(),
  relationship: z.string().optional(),
  visitedAt: z.number(),
  durationMinutes: z.number().optional(),
  partySize: z.number().optional(),
  supervisingOfficer: z.string().optional(),
  notes: z.string().optional(),
  visitType: z.string().min(1, 'Visit type is required.'),
  status: z.string().optional(),
  authorizedBy: z.string().optional(),
  overLimitReason: z.string().optional(),
})

export type CreateVisitInput = z.infer<typeof createVisitSchema>

export type CheckInInput = {
  idVerified: boolean
  searchDone: boolean
  items: { description: string; disposition: string }[]
}
