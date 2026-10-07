import * as m from '@/paraglide/messages'
import * as z from 'zod'
import { templatesFor } from '@/features/templates'
import { activeJurisdiction } from '@/lib/jurisdiction'

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
  sourceDecisionId: z.string().nullable(),
  author: z.string().nullable(),
  preparedAt: z.number(),
  issuedAt: z.number().nullable(),
  contentSha256: z.string().nullable(),
  integrity: z.string(),
  content: z.object({
    office: z.string(),
    title: z.string(),
    blocks: z.array(blockSchema),
    letterhead: z.array(z.string()).optional(),
    lang: z.string().optional(),
    signatureImage: z.string().optional(),
    stampImage: z.string().optional(),
    verifyCode: z.string().optional(),
    verifyQr: z.string().optional(),
    ink: z.string().optional(),
  }),
})

export type DocumentRecord = z.infer<typeof documentSchema>
export type DocumentContent = DocumentRecord['content']

/** The documents the product documentation names. Everything else is planned. */
export const documentKinds = [
  { id: 'charge_sheet', get label() { return m["doc.kind.charge_sheet"]() }, get about() { return m["doc.kind.charge_sheet_about"]() } },
  { id: 'directions_to_police', get label() { return m["capacity.directions"]() }, get about() { return m["doc.kind.directions_about"]() } },
  { id: 'decline_reasons', get label() { return m["doc.kind.decline_reasons"]() }, get about() { return m["doc.kind.decline_reasons_about"]() } },
] as const

export function documentKindLabel(kind: string) {
  // A document from a template takes its title in the office's country.
  return documentKinds.find((k) => k.id === kind)?.label ?? templatesFor(activeJurisdiction()).find((t) => t.id === kind)?.title ?? kind
}

/** The decisions that produce a document (server: `kind_for`). */
export function decisionDocumentKind(decisionType: string): string | null {
  if (['sanction', 'threshold_charge', 'amend_charge'].includes(decisionType)) return 'charge_sheet'
  if (decisionType === 'return_for_investigation') return 'directions_to_police'
  if (decisionType === 'decline') return 'decline_reasons'
  return null
}

export const exportFormats = [
  { id: 'docx', label: () => m["doc.download_docx"]() },
  { id: 'md', label: () => m["doc.download_md"]() },
] as const

export type ExportFormat = (typeof exportFormats)[number]['id']
