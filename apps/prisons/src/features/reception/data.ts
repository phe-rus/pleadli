import { api } from '@/lib/api'
import { fromDateInput, fromDatetimeLocal } from '@/lib/datetime'
import { receptionResultSchema, type ReceptionDraft } from './schema'

const blankToNull = (value: string) => (value.trim() ? value.trim() : null)
const wholeNumber = (value: string) => Math.max(0, Math.floor(Number(value) || 0))

/** The wire shape of `POST /api/prisons/receptions` (domain/custody.rs). */
export function toReceptionPayload(draft: ReceptionDraft) {
  const receivedAt = fromDatetimeLocal(draft.receivedAt)
  const refuse = draft.decision === 'refuse'
  const convicted = draft.legalStatus === 'convicted'
  const hasSentence = convicted && (draft.isLife || wholeNumber(draft.termYears) + wholeNumber(draft.termMonths) + wholeNumber(draft.termDays) > 0)

  return {
    decision: draft.decision,
    refusalGround: refuse ? blankToNull(draft.refusalGround) : null,
    decisionReason: blankToNull(draft.decisionReason),
    receivedAt,
    person: {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      otherNames: blankToNull(draft.otherNames),
      nationalId: blankToNull(draft.nationalId),
      reference: blankToNull(draft.reference),
      sex: blankToNull(draft.sex),
      dateOfBirth: fromDateInput(draft.dateOfBirth),
      nationality: blankToNull(draft.nationality),
      educationLevel: blankToNull(draft.educationLevel),
    },
    legalStatus: draft.legalStatus,
    offence: blankToNull(draft.offence),
    highCourtOnlyOffence: draft.highCourtOnly,
    instrument: {
      kind: draft.instrumentKind,
      issuingAuthority: blankToNull(draft.issuingAuthority),
      reference: blankToNull(draft.instrumentReference),
      issuedOn: fromDateInput(draft.issuedOn),
      authenticated: draft.authenticated,
      verificationNote: blankToNull(draft.verificationNote),
    },
    pendingDocumentType: draft.decision === 'accept_pending' ? blankToNull(draft.pendingDocumentType) : null,
    sentence: hasSentence
      ? {
          termYears: draft.isLife ? 0 : wholeNumber(draft.termYears),
          termMonths: draft.isLife ? 0 : wholeNumber(draft.termMonths),
          termDays: draft.isLife ? 0 : wholeNumber(draft.termDays),
          isLife: draft.isLife,
          startsOn: fromDateInput(draft.sentenceStartsOn) ?? receivedAt,
        }
      : null,
    searchDone: draft.searchDone,
    injuriesNote: blankToNull(draft.injuriesNote),
    complaintsNote: blankToNull(draft.complaintsNote),
    healthScreenNote: blankToNull(draft.healthScreenNote),
    rulesInformationGiven: draft.rulesInformationGiven,
    property: draft.property.map((line) => line.trim()).filter(Boolean),
    contacts: draft.contacts
      .filter((c) => c.name.trim())
      .map((c) => ({
        name: c.name.trim(),
        relationship: blankToNull(c.relationship),
        phone: blankToNull(c.phone),
        address: blankToNull(c.address),
        isEmergency: c.isEmergency,
        notifyOnImprisonment: c.notifyOnImprisonment,
      })),
    placement: blankToNull(draft.placement),
    notes: blankToNull(draft.notes),
    photos: draft.decision === 'refuse' ? null : draft.photos,
  }
}

export async function receivePerson(draft: ReceptionDraft) {
  return receptionResultSchema.parse(await api('POST', '/api/prisons/receptions', { body: toReceptionPayload(draft) }))
}
