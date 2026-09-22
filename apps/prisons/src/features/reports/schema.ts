import * as z from 'zod'

export const labeledCountSchema = z.object({
  label: z.string(),
  count: z.number(),
})

export const reportsSummarySchema = z.object({
  admissionTimestamps: z.array(z.number()),
  releaseTimestamps: z.array(z.number()),
  transferTimestamps: z.array(z.number()),
  visitTimestamps: z.array(z.number()),
  courtProductionTimestamps: z.array(z.number()),
  healthEventTimestamps: z.array(z.number()),
  prisonerCategoryCounts: z.array(labeledCountSchema),
  custodyStatusCounts: z.array(labeledCountSchema),
  releaseTypeCounts: z.array(labeledCountSchema),
  transferDirectionCounts: z.array(labeledCountSchema),
  healthEventTypeCounts: z.array(labeledCountSchema),
  admissionYearCounts: z.array(labeledCountSchema),
  admissionMonthCounts: z.array(labeledCountSchema),
  prisonerAgeGroupCounts: z.array(labeledCountSchema),
  prisonerSexCounts: z.array(labeledCountSchema),
  prisonerEducationCounts: z.array(labeledCountSchema),
  prisonerNationalityCounts: z.array(labeledCountSchema),
  prisonerOffenceTypeCounts: z.array(labeledCountSchema),
  prisonerSentenceCategoryCounts: z.array(labeledCountSchema),
  facilityPopulationCounts: z.array(labeledCountSchema),
  facilityInCustodyCounts: z.array(labeledCountSchema),
})

export type ReportsSummary = z.infer<typeof reportsSummarySchema>

/** The kinds of report the node produces. A period-less kind is a snapshot of
 * now; a Head Office kind is only ever produced by Head Office. */
export const reportKindSchema = z.enum([
  'monthly_return',
  'admission_register',
  'discharge_register',
  'transfer_register',
  'visitors_register',
  'remand_list',
  'network_register',
])
export type ReportKind = z.infer<typeof reportKindSchema>

export const reportRecordSchema = z.object({
  id: z.string(),
  reference: z.string(),
  kind: z.string(),
  title: z.string(),
  periodFrom: z.number().nullable(),
  periodTo: z.number().nullable(),
  templateVersion: z.number(),
  contentHash: z.string(),
  generatedByName: z.string(),
  generatedAt: z.number(),
  /** Set once the officer in charge has attested a monthly return. */
  attestedAt: z.number().nullable(),
  attestedByName: z.string().nullable(),
  attestedByBadge: z.string().nullable(),
  attestationStatement: z.string().nullable(),
  /** `queued` while it waits for Head Office, `acknowledged` once received. */
  submission: z.enum(['queued', 'acknowledged']).nullable(),
  acknowledgedAt: z.number().nullable(),
  submissionError: z.string().nullable(),
})
export type ReportRecord = z.infer<typeof reportRecordSchema>

export const reportIssuerSchema = z.object({
  name: z.string().nullable(),
  facilityNumber: z.string().nullable(),
  location: z.string().nullable(),
  region: z.string().nullable(),
})

export const reportDocumentSchema = z.object({
  kind: z.string(),
  title: z.string(),
  periodFrom: z.number().nullable(),
  periodTo: z.number().nullable(),
  asAt: z.number(),
  issuer: reportIssuerSchema,
  body: z.unknown(),
})

export const generatedReportSchema = reportRecordSchema.extend({ document: reportDocumentSchema })
export type GeneratedReport = z.infer<typeof generatedReportSchema>

export const returnCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcome: z.enum(['pass', 'fail', 'note']),
  detail: z.string().nullable(),
})
export type ReturnCheck = z.infer<typeof returnCheckSchema>

export const returnChecksSchema = z.object({
  passed: z.boolean(),
  checks: z.array(returnCheckSchema),
  statement: z.string(),
})
export type ReturnChecks = z.infer<typeof returnChecksSchema>

/** A return Head Office received from a facility, without its figures. */
export const receivedReturnSchema = z.object({
  id: z.string(),
  facilityId: z.string(),
  facilityName: z.string(),
  reference: z.string(),
  title: z.string(),
  periodFrom: z.number(),
  periodTo: z.number(),
  attestedByName: z.string(),
  attestedByBadge: z.string().nullable(),
  attestedAt: z.number(),
  receivedAt: z.number(),
  /** A later attested return for the same facility and period replaces it. */
  superseded: z.boolean(),
})
export type ReceivedReturn = z.infer<typeof receivedReturnSchema>

export type GenerateReportInput = { kind: ReportKind; from?: number; to?: number }

const counts = z.array(labeledCountSchema)

const populationSchema = z.object({
  held: z.number(),
  convicted: z.number(),
  unconvicted: z.number(),
  civil: z.number(),
  male: z.number(),
  female: z.number(),
  sexNotRecorded: z.number(),
  inTransit: z.number(),
  capacity: z.number().nullable(),
  ageGroups: counts,
  nationality: counts,
  education: counts,
  offenceType: counts,
})

export const monthlyReturnSchema = z.object({
  population: populationSchema,
  admissions: counts,
  admissionInstruments: counts,
  discharges: counts,
  transfersOut: z.number(),
  transfersIn: z.number(),
  courtProductions: counts,
  visits: counts,
  visitTypes: counts,
  healthEvents: counts,
  complaints: z.object({ raised: z.number(), resolved: z.number(), openNow: z.number() }),
})
export type MonthlyReturn = z.infer<typeof monthlyReturnSchema>

const rows = <T extends z.ZodType>(row: T) => z.object({ rows: z.array(row) })

export const admissionRowsSchema = rows(
  z.object({
    id: z.string(),
    prisonerNumber: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    otherNames: z.string().nullable(),
    status: z.string(),
    admissionInstrumentType: z.string(),
    admissionAuthority: z.string().nullable(),
    offence: z.string().nullable(),
    admittedAt: z.number(),
    currentStatus: z.string(),
  }),
)

export const dischargeRowsSchema = rows(
  z.object({
    id: z.string(),
    prisonerId: z.string(),
    prisonerNumber: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    releaseType: z.string(),
    releasedAt: z.number(),
    orderedBy: z.string().nullable(),
    authorisedBy: z.string().nullable(),
  }),
)

export const transferRowsSchema = rows(
  z.object({
    id: z.string(),
    direction: z.string(),
    state: z.string(),
    personName: z.string().nullable(),
    prisonerNumber: z.string().nullable(),
    otherPrisonName: z.string().nullable(),
    orderReference: z.string().nullable(),
    orderingAuthority: z.string().nullable(),
    reason: z.string().nullable(),
    transferredAt: z.number(),
  }),
)

export const visitRowsSchema = rows(
  z.object({
    id: z.string(),
    visitedAt: z.number(),
    prisonerNumber: z.string().nullable(),
    prisonerFirstName: z.string(),
    prisonerLastName: z.string(),
    visitorName: z.string(),
    relationship: z.string().nullable(),
    visitType: z.string(),
    status: z.string(),
    partySize: z.number(),
    startedAt: z.number().nullable(),
    endedAt: z.number().nullable(),
  }),
)

export const remandRowsSchema = rows(
  z.object({
    prisonerId: z.string(),
    prisonerNumber: z.string().nullable(),
    firstName: z.string(),
    lastName: z.string(),
    offence: z.string().nullable(),
    admittedAt: z.number(),
    admissionAuthority: z.string().nullable(),
    highCourtOnlyOffence: z.boolean(),
    lastProducedAt: z.number().nullable(),
  }),
)

export const networkRowsSchema = rows(
  z.object({
    id: z.string(),
    name: z.string(),
    facilityNumber: z.string(),
    region: z.string(),
    location: z.string(),
    status: z.string(),
    lastSyncedAt: z.number().nullable(),
    officerCount: z.number(),
    heldAtLastSync: z.number().nullable(),
  }),
)

// ---------------------------------------------------------------------
// Composed reports: a document of written text and tables, saved as a draft
// and issued once. The node keeps the blocks as sent; these describe what
// the editor puts in them.
// ---------------------------------------------------------------------

/** Written text. `doc` is the editor's own document as JSON, the same form
 * every rich-text field in the app keeps; Markdown is a way to write and read
 * it, never a second copy. */
export const textBlockSchema = z.object({ id: z.string(), type: z.literal('text'), doc: z.string() })

/** A table of text cells. It holds the rows as they were when loaded from a
 * register, plus what the officer did to them: which columns show, which rows
 * are in, and any cell they typed over. A row that was edited keeps the
 * register's own values in `original`, so an issued report can say how much of
 * it was changed by hand. */
export const tableBlockSchema = z.object({
  id: z.string(),
  type: z.literal('table'),
  caption: z.string(),
  source: z.object({ kind: z.string(), from: z.number().nullable(), to: z.number().nullable(), loadedAt: z.number() }).nullable(),
  columns: z.array(z.object({ key: z.string(), label: z.string(), align: z.enum(['left', 'right']), visible: z.boolean() })),
  rows: z.array(
    z.object({
      id: z.string(),
      included: z.boolean(),
      cells: z.record(z.string(), z.string()),
      original: z.record(z.string(), z.string()).optional(),
    }),
  ),
})

export const blockSchema = z.discriminatedUnion('type', [textBlockSchema, tableBlockSchema])
export type Block = z.infer<typeof blockSchema>
export type TextBlock = z.infer<typeof textBlockSchema>
export type TableBlock = z.infer<typeof tableBlockSchema>

export const draftSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  createdByName: z.string(),
  updatedByName: z.string(),
  updatedAt: z.number(),
  /** Set once issued: the draft is then read-only and the report is opened instead. */
  issuedReportId: z.string().nullable(),
})
export type DraftSummary = z.infer<typeof draftSummarySchema>

export const draftSchema = draftSummarySchema.extend({ blocks: z.array(blockSchema) })
export type Draft = z.infer<typeof draftSchema>

export const composedBodySchema = z.object({ blocks: z.array(blockSchema) })

/** Drafts are named with this prefix by the node, so a report's address says
 * which of the two it is without asking. */
export const isDraftId = (id: string) => id.startsWith('draft-')
