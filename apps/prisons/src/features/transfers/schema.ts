import * as z from 'zod'

export const transferDirections = [
  { value: 'out', label: 'Sent to another prison' },
  { value: 'in', label: 'Received from another prison' },
] as const

export function transferDirectionLabel(direction: string) {
  return transferDirections.find((d) => d.value === direction)?.label ?? direction
}

const outStates: Record<string, string> = {
  preparing: 'Preparing',
  in_transit: 'In transit',
  confirmed: 'Confirmed by receiver',
  cancelled: 'Cancelled',
}
const inStates: Record<string, string> = {
  arrived: 'Arrived, awaiting confirmation',
  confirmed: 'Received and confirmed',
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
  { key: 'propertyStatement', label: 'Property packed and a statement of it prepared' },
  { key: 'documentsCopied', label: 'Instruments and documents copied for the dossier' },
  { key: 'medicalSummary', label: 'Medical summary prepared, as permitted' },
  { key: 'familyInformed', label: 'Family or next of kin informed' },
  { key: 'transferLetter', label: 'Transfer letter written (s.78(2))' },
  { key: 'courtConflictsChecked', label: 'Scheduled court productions checked for conflict' },
  { key: 'keepInAreaNoted', label: 'Preference to stay near home noted (s.73(4))' },
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
  destinationName: z.string().min(1, 'Name the prison the person is going to.'),
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
  passphrase: z.string().min(8, 'The passphrase must be at least 8 characters.'),
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
