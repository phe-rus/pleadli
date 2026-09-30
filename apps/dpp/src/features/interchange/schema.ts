import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const identitySchema = z.object({
  officeId: z.string(),
  officeName: z.string(),
  jurisdiction: z.string().nullable(),
  verifyingKey: z.string(),
  encryptionKey: z.string(),
  fingerprint: z.string(),
  createdAt: z.number(),
})

export const connectionSchema = z.object({
  id: z.string(),
  intendedStation: z.string(),
  status: z.string(),
  inviteExpiresAt: z.number(),
  stationId: z.string().nullable(),
  stationName: z.string().nullable(),
  stationJurisdiction: z.string().nullable(),
  officerInCharge: z.string().nullable(),
  fingerprint: z.string().nullable(),
  respondedAt: z.number().nullable(),
  confirmedAt: z.number().nullable(),
  confirmedBy: z.string().nullable(),
  revokedAt: z.number().nullable(),
  revokedReason: z.string().nullable(),
  lastSeqIn: z.number(),
  createdAt: z.number(),
  /** `invited`, `expired`, `awaiting_confirmation`, `trusted`, `declined`, `revoked`. */
  state: z.string(),
  waiting: z.number(),
})

export type Connection = z.infer<typeof connectionSchema>

export const connectionStates: Record<string, { label: string; tone: 'open' | 'waiting' | 'done' | 'stopped' | 'urgent' }> = {
  invited: { get label() { return m["interchange.state.invited"]() }, tone: 'waiting' },
  expired: { get label() { return m["interchange.state.expired"]() }, tone: 'stopped' },
  awaiting_confirmation: { get label() { return m["interchange.state.awaiting_confirmation"]() }, tone: 'open' },
  trusted: { get label() { return m["interchange.state.trusted"]() }, tone: 'done' },
  declined: { get label() { return m["interchange.state.declined"]() }, tone: 'stopped' },
  revoked: { get label() { return m["interchange.state.revoked"]() }, tone: 'urgent' },
}

export const importOutcomeSchema = z.object({ kind: z.string(), connectionId: z.string(), packageId: z.string().nullable(), message: z.string() })
export type ImportOutcome = z.infer<typeof importOutcomeSchema>

export const incomingSummarySchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  stationName: z.string().nullable(),
  seq: z.number(),
  sentAt: z.number(),
  receivedAt: z.number(),
  status: z.string(),
  policeReference: z.string().nullable(),
  decidedAt: z.number().nullable(),
  decidedBy: z.string().nullable(),
  rejectReason: z.string().nullable(),
  prosecutionFileId: z.string().nullable(),
  resubmission: z.boolean(),
})

const personSchema = z.object({
  key: z.string(),
  role: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  nationalId: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
})

export const incomingDetailSchema = incomingSummarySchema.extend({
  senderFingerprint: z.string(),
  packageSha256: z.string(),
  connectionState: z.string(),
  payload: z.object({
    policeReference: z.string(),
    stationName: z.string(),
    referredAt: z.number(),
    referringOfficer: z.string().nullable().optional(),
    summary: z.string(),
    people: z.array(personSchema),
    statements: z.array(z.object({ key: z.string(), personKey: z.string(), role: z.string(), givenAt: z.number(), content: z.string(), takenBy: z.string().nullable().optional(), fileIds: z.array(z.string()) })),
    exhibits: z.array(z.object({ key: z.string(), description: z.string(), identificationMark: z.string().nullable().optional(), recoveredFromLocation: z.string().nullable().optional(), fileIds: z.array(z.string()) })),
    charges: z.array(z.object({ accusedPersonKey: z.string().nullable().optional(), offence: z.string(), statutorySection: z.string().nullable().optional(), particulars: z.string().nullable().optional() })),
    resubmissionOf: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
  files: z.array(z.object({ id: z.string(), name: z.string(), mime: z.string(), sha256: z.string(), size: z.number() })),
  matches: z.array(z.object({ personKey: z.string(), existingPersonId: z.string(), existingName: z.string() })),
  resubmissionTarget: z.object({ fileId: z.string(), title: z.string(), status: z.string() }).nullable(),
  missingBefore: z.number(),
  nameDiffers: z.boolean(),
})

export type IncomingSummary = z.infer<typeof incomingSummarySchema>
export type IncomingDetail = z.infer<typeof incomingDetailSchema>

export const outgoingSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  kind: z.string(),
  seq: z.number(),
  inReplyTo: z.string().nullable(),
  prosecutionFileId: z.string().nullable(),
  decisionId: z.string().nullable(),
  preparedAt: z.number(),
  exportedAt: z.number().nullable(),
  stationName: z.string().nullable(),
  fileTitle: z.string().nullable(),
  policeReference: z.string().nullable(),
  summary: z.string(),
})

export type Outgoing = z.infer<typeof outgoingSchema>

export const outgoingKindLabels: Record<string, string> = {
  get receipt() { return m["interchange.kind.receipt"]() },
  get decision_notice() { return m["interchange.kind.decision_notice"]() },
  get pairing_confirmation() { return m["interchange.kind.pairing_confirmation"]() },
}

export const acceptedSchema = z.object({ fileId: z.string(), attached: z.number(), attachmentsFailed: z.number() })
export const preparedSchema = z.object({ id: z.string(), draftDocuments: z.number() })

export const roleLabels: Record<string, string> = {
  get accused() { return m["interchange.role.accused"]() },
  get complainant() { return m["interchange.role.complainant"]() },
  get witness() { return m["interchange.role.witness"]() },
  get arresting_officer() { return m["interchange.role.arresting_officer"]() },
  get investigating_officer() { return m["interchange.role.investigating_officer"]() },
}
