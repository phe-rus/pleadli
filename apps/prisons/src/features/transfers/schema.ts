import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const transferDirections = [
  { value: 'out', get label() { return m.transfers_sent_to_another_prison() } },
  { value: 'in', get label() { return m.transfers_received_from_another_prison() } },
] as const

export function transferDirectionLabel(direction: string) {
  return transferDirections.find((d) => d.value === direction)?.label ?? direction
}

const outStates: Record<string, string> = {
  get preparing() { return m.transfers_preparing() },
  get in_transit() { return m.transfers_in_transit() },
  get confirmed() { return m.transfers_confirmed_by_receiver() },
  get cancelled() { return m.transfers_cancelled() },
}
const inStates: Record<string, string> = {
  get arrived() { return m.transfers_arrived_awaiting_confirmation() },
  get confirmed() { return m.transfers_received_and_confirmed() },
}

export function transferStateLabel(direction: string, state: string) {
  return (direction === 'in' ? inStates : outStates)[state] ?? state
}

export const transferSchema = z.object({
  id: z.string(),
  prisonerId: z.string().nullable(),
  direction: z.string(),
  state: z.string(),
  episodeId: z.string().nullable(),
  personName: z.string().nullable(),
  otherPrisonName: z.string().nullable(),
  transferredAt: z.number(),
  orderingAuthority: z.string().nullable(),
  orderReference: z.string().nullable(),
  reason: z.string().nullable(),
  plannedAt: z.number().nullable(),
  dispatchedAt: z.number().nullable(),
  escort: z.string().nullable(),
  transport: z.string().nullable(),
  arrivedAt: z.number().nullable(),
  confirmedAt: z.number().nullable(),
  checklistJson: z.string().nullable(),
  dossierDigest: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.number(),
})

export type Transfer = z.infer<typeof transferSchema>

export const checklistSchema = z.object({
  propertyStatement: z.boolean().default(false),
  documentsCopied: z.boolean().default(false),
  medicalSummary: z.boolean().default(false),
  familyInformed: z.boolean().default(false),
  transferLetter: z.boolean().default(false),
  courtConflictsChecked: z.boolean().default(false),
  keepInAreaNoted: z.boolean().default(false),
  note: z.string().nullable().default(null),
})

export type Checklist = z.infer<typeof checklistSchema>

export const checklistItems = [
  { key: 'propertyStatement', get label() { return m.transfers_property_packed_and_a_statement_of() } },
  { key: 'documentsCopied', get label() { return m.transfers_instruments_and_documents_copied_for_the() } },
  { key: 'medicalSummary', get label() { return m.transfers_medical_summary_prepared_as_permitted() } },
  { key: 'familyInformed', get label() { return m.transfers_family_or_next_of_kin_informed() } },
  { key: 'transferLetter', get label() { return m.transfers_transfer_letter_written_s_78_2() } },
  { key: 'courtConflictsChecked', get label() { return m.transfers_scheduled_court_productions_checked_for() } },
  { key: 'keepInAreaNoted', get label() { return m.transfers_preference_to_stay_near_home_noted() } },
] as const satisfies readonly { key: keyof Checklist; label: string }[]

export function parseChecklist(json: string | null): Checklist {
  try {
    return checklistSchema.parse(json ? JSON.parse(json) : {})
  } catch {
    return checklistSchema.parse({})
  }
}

export const prepareTransferSchema = z.object({
  prisonerId: z.string().min(1),
  destinationName: z.string().min(1, { error: () => m.validation_destination_required() }),
  orderReference: z.string(),
  orderingAuthority: z.string(),
  reason: z.string(),
  plannedAt: z.number(),
  notes: z.string(),
})

export type PrepareTransferInput = z.infer<typeof prepareTransferSchema>

export const dispatchTransferSchema = z.object({
  departedAt: z.number(),
  escort: z.string(),
  transport: z.string(),
  passphrase: z.string().min(8, { error: () => m.validation_passphrase_min_8() }),
})

export type DispatchTransferInput = z.infer<typeof dispatchTransferSchema>

export const fileExportSchema = z.object({ fileName: z.string(), contentBase64: z.string() })

export type FileExport = z.infer<typeof fileExportSchema>

export const dispatchResultSchema = z.object({ transfer: transferSchema, file: fileExportSchema })

export type DispatchResult = z.infer<typeof dispatchResultSchema>

const dossierInstrumentSchema = z.object({
  id: z.string(),
  kind: z.string(),
  issuingAuthority: z.string().nullable(),
  reference: z.string().nullable(),
  issuedOn: z.number().nullable(),
  receivedAt: z.number().nullable(),
  authenticated: z.boolean(),
  status: z.string(),
})

const dossierPrisonerSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  otherNames: z.string().nullable(),
  nationalId: z.string().nullable(),
  reference: z.string().nullable(),
  status: z.string(),
  admissionInstrumentType: z.string(),
  admissionAuthority: z.string().nullable(),
  admittedAt: z.number(),
  highCourtOnlyOffence: z.boolean(),
  currentLocation: z.string().nullable(),
  dateOfBirth: z.number().nullable(),
  sex: z.string().nullable(),
  offence: z.string().nullable(),
  documentsPending: z.boolean(),
  pendingDocumentType: z.string().nullable(),
})

const dossierSentenceSchema = z.object({
  termYears: z.number(),
  termMonths: z.number(),
  termDays: z.number(),
  isLife: z.boolean(),
  startsOn: z.number(),
})

export const dossierPreviewSchema = z.object({
  transferId: z.string(),
  episodeId: z.string(),
  fromFacility: z.string(),
  orderReference: z.string().nullable(),
  orderingAuthority: z.string().nullable(),
  departedAt: z.number(),
  prisoner: dossierPrisonerSchema,
  instruments: z.array(dossierInstrumentSchema),
  sentence: dossierSentenceSchema.nullable(),
  contacts: z.array(
    z.object({ name: z.string(), relationship: z.string().nullable(), phone: z.string().nullable(), isEmergency: z.boolean() }),
  ),
  property: z.array(z.object({ id: z.string(), description: z.string() })),
  scheduledProductions: z.array(
    z.object({ courtReference: z.string().nullable(), productionDate: z.number(), purpose: z.string().nullable(), productionMethod: z.string() }),
  ),
  fileNames: z.array(z.string()),
  checklist: checklistSchema,
  returning: z.boolean(),
})

export type DossierPreview = z.infer<typeof dossierPreviewSchema>

export const confirmArrivalSchema = z.object({
  identityVerified: z.boolean(),
  discrepancyNote: z.string(),
  property: z.array(z.object({ id: z.string(), received: z.boolean() })),
  placement: z.string(),
  healthScreenNote: z.string(),
  receivedAt: z.number(),
})

export type ConfirmArrivalInput = z.infer<typeof confirmArrivalSchema>
