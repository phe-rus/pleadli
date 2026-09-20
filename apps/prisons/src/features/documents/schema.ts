import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const documentKinds = ['reception_record', 'discharge_certificate', 'transfer_dossier'] as const
export type DocumentKind = (typeof documentKinds)[number]

export const documentKindLabel: Record<DocumentKind, string> = {
  get reception_record() { return m.documents_reception_record() },
  get discharge_certificate() { return m.documents_discharge_certificate() },
  get transfer_dossier() { return m.documents_transfer_dossier() },
}

export const isDocumentKind = (value: string): value is DocumentKind => (documentKinds as readonly string[]).includes(value)

export const issuedDocumentSchema = z.object({
  id: z.string(),
  number: z.string(),
  kind: z.string(),
  recordId: z.string(),
  issuedAt: z.number(),
  issuedByName: z.string(),
  issuedByBadge: z.string().nullable(),
  reprints: z.number(),
  lastPrintedAt: z.number().nullable(),
  verification: z.string(),
})

export type IssuedDocument = z.infer<typeof issuedDocumentSchema>
