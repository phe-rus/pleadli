import * as z from 'zod'

const field = z.object({ label: z.string(), value: z.string() })

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string() }),
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('note'), text: z.string() }),
  z.object({ type: z.literal('fields'), rows: z.array(field) }),
  z.object({ type: z.literal('list'), ordered: z.boolean(), items: z.array(z.object({ title: z.string().nullable(), text: z.string() })) }),
  z.object({ type: z.literal('signature'), label: z.string(), name: z.string(), caption: z.string().nullable() }),
])

export type Block = z.infer<typeof blockSchema>

export const documentSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  fileTitle: z.string(),
  fileReference: z.string().nullable(),
  kind: z.string(),
  title: z.string(),
  reference: z.string().nullable(),
  status: z.string(),
  sourceDecisionId: z.string(),
  author: z.string().nullable(),
  preparedAt: z.number(),
  issuedAt: z.number().nullable(),
  contentSha256: z.string().nullable(),
  integrity: z.string(),
  content: z.object({ office: z.string(), title: z.string(), blocks: z.array(blockSchema) }),
})

export type DocumentRecord = z.infer<typeof documentSchema>

/** The documents the product documentation names. Everything else is planned. */
export const documentKinds = [
  { id: 'charge_sheet', label: 'Charge sheet', about: 'The sanctioned charge sheet, from a decision to sanction, to charge on the Threshold Test, or to amend the charge.' },
  { id: 'directions_to_police', label: 'Directions to Police', about: 'The directions on a return for further investigation.' },
  { id: 'decline_reasons', label: 'Written reasons for declining', about: 'The privileged written reasons for a decision to decline to charge.' },
] as const

export function documentKindLabel(kind: string) {
  return documentKinds.find((k) => k.id === kind)?.label ?? kind
}

/** The decisions that produce a document (server: `kind_for`). */
export function decisionDocumentKind(decisionType: string): string | null {
  if (['sanction', 'threshold_charge', 'amend_charge'].includes(decisionType)) return 'charge_sheet'
  if (decisionType === 'return_for_investigation') return 'directions_to_police'
  if (decisionType === 'decline') return 'decline_reasons'
  return null
}

export const exportFormats = [
  { id: 'docx', label: 'Download DOCX' },
  { id: 'md', label: 'Download Markdown' },
] as const

export type ExportFormat = (typeof exportFormats)[number]['id']
