import * as z from 'zod'
import { prisonerSchema } from '@/features/prisoners/schema'

export const receptionDecisions = [
  { value: 'accept', label: 'Accept', description: 'The instrument is verified. Receive the person.' },
  { value: 'accept_pending', label: 'Accept, document pending', description: 'Receive the person now. A required document is still to arrive (s.58(4)).' },
  { value: 'refuse', label: 'Refuse', description: 'Do not receive the person. Record the ground.' },
] as const

export type ReceptionDecision = (typeof receptionDecisions)[number]['value']

export const refusalGrounds = [
  { value: 'torture_ill_health', label: 'Severely tortured and in bad health (s.58(3))' },
  { value: 'juvenile', label: 'A juvenile sent to an adult prison (s.58(7))' },
  { value: 'defective_instrument', label: 'Instrument defective or particulars do not match' },
  { value: 'other', label: 'Other ground' },
] as const

export const contactRelationships = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'relative', label: 'Other relative' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Other' },
] as const

export type ContactDraft = {
  name: string
  relationship: string
  phone: string
  address: string
  isEmergency: boolean
  notifyOnImprisonment: boolean
}

/** Everything the officer has entered so far. Held as one plain object so a
 * step can be revisited at any time without losing another step's input. */
export type ReceptionDraft = {
  receivedAt: string
  instrumentKind: string
  issuingAuthority: string
  instrumentReference: string
  issuedOn: string
  authenticated: boolean
  verificationNote: string
  firstName: string
  lastName: string
  otherNames: string
  nationalId: string
  reference: string
  sex: string
  dateOfBirth: string
  nationality: string
  educationLevel: string
  legalStatus: string
  offence: string
  highCourtOnly: boolean
  isLife: boolean
  termYears: string
  termMonths: string
  termDays: string
  sentenceStartsOn: string
  searchDone: boolean
  injuriesNote: string
  complaintsNote: string
  property: string[]
  contacts: ContactDraft[]
  healthScreenNote: string
  rulesInformationGiven: boolean
  placement: string
  notes: string
  decision: ReceptionDecision
  pendingDocumentType: string
  refusalGround: string
  decisionReason: string
}

export const receptionResultSchema = z.object({
  receptionId: z.string(),
  decision: z.string(),
  prisoner: prisonerSchema.nullable(),
})

export type ReceptionResult = z.infer<typeof receptionResultSchema>

export function emptyContact(): ContactDraft {
  return { name: '', relationship: '', phone: '', address: '', isEmergency: true, notifyOnImprisonment: false }
}
