import * as z from 'zod'
import { prisonerSchema } from '@/features/prisoners/schema'
import { m } from '@/paraglide/messages'

export const receptionDecisions = [
  { value: 'accept', get label() { return m.reception_accept() }, get description() { return m.reception_the_instrument_is_verified_receive_the() } },
  { value: 'accept_pending', get label() { return m.reception_accept_document_pending() }, get description() { return m.reception_receive_the_person_now_a_required() } },
  { value: 'refuse', get label() { return m.reception_refuse() }, get description() { return m.reception_do_not_receive_the_person_record() } },
] as const

export type ReceptionDecision = (typeof receptionDecisions)[number]['value']

export const refusalGrounds = [
  { value: 'torture_ill_health', get label() { return m.reception_severely_tortured_and_in_bad_health() } },
  { value: 'juvenile', get label() { return m.reception_a_juvenile_sent_to_an_adult() } },
  { value: 'defective_instrument', get label() { return m.reception_instrument_defective_or_particulars_do_n() } },
  { value: 'other', get label() { return m.reception_other_ground() } },
] as const

export const contactRelationships = [
  { value: 'spouse', get label() { return m.reception_spouse() } },
  { value: 'parent', get label() { return m.reception_parent() } },
  { value: 'child', get label() { return m.reception_child() } },
  { value: 'sibling', get label() { return m.reception_sibling() } },
  { value: 'relative', get label() { return m.reception_other_relative() } },
  { value: 'friend', get label() { return m.reception_friend() } },
  { value: 'other', get label() { return m.reception_other() } },
] as const

export type PhotoDrafts = { front: string | null; left: string | null; right: string | null }

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
  photos: PhotoDrafts
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
