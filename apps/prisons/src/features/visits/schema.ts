import * as z from 'zod'
import { m } from '@/paraglide/messages'

// Six real, grounded categories (docs/prisons/RESEARCH.md 9-10, 11.7).
// legal_advisor (Prisons Act s.64(3)) and personal_doctor are seen within
// sight but not within hearing, so their record keeps no content.
// special_authorization_* need the Officer in Charge to approve.
export const visitTypes = [
  { value: 'ordinary', get label() { return m.visits_ordinary_visit() } },
  { value: 'legal_advisor', get label() { return m.visits_legal_advisor_s_64_3() } },
  { value: 'personal_doctor', get label() { return m.visits_personal_doctor() } },
  { value: 'voluntary_visitor', get label() { return m.visits_voluntary_visitor_ngo_clergy_care_office() } },
  { value: 'special_authorization_weekend', get label() { return m.visits_special_authorization_weekend_visit() } },
  { value: 'special_authorization_researcher', get label() { return m.visits_special_authorization_researcher() } },
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
  { value: 'requested', get label() { return m.visits_requested() } },
  { value: 'scheduled', get label() { return m.visits_scheduled() } },
  { value: 'checked_in', get label() { return m.visits_at_the_gate() } },
  { value: 'in_progress', get label() { return m.visits_in_progress() } },
  { value: 'completed', get label() { return m.visits_completed_2() } },
  { value: 'denied', get label() { return m.visits_refused() } },
  { value: 'no_show', get label() { return m.visits_no_show() } },
  { value: 'cancelled', get label() { return m.visits_cancelled() } },
] as const

const legacyStatusLabels: Record<string, string> = { get authorized() { return m.visits_scheduled() }, get attended() { return m.visits_completed_2() } }

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
  { value: 'national_id', get label() { return m.visits_national_id() } },
  { value: 'passport', get label() { return m.visits_passport() } },
  { value: 'driving_permit', get label() { return m.visits_driving_permit() } },
  { value: 'other', get label() { return m.visits_other_photo_id() } },
] as const

export function idTypeLabel(value: string) {
  return idTypes.find((v) => v.value === value)?.label ?? value
}

export const itemDispositions = [
  { value: 'handed_over', get label() { return m.visits_handed_to_the_prisoner() } },
  { value: 'held', get label() { return m.visits_held_at_the_gate() } },
  { value: 'refused', get label() { return m.visits_refused() } },
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
  { value: 1, get label() { return m.visits_mon() } },
  { value: 2, get label() { return m.visits_tue() } },
  { value: 3, get label() { return m.visits_wed() } },
  { value: 4, get label() { return m.visits_thu() } },
  { value: 5, get label() { return m.visits_fri() } },
  { value: 6, get label() { return m.visits_sat() } },
  { value: 7, get label() { return m.visits_sun() } },
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
