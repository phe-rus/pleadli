import { api } from '@/lib/api'
import { issuedDocumentSchema, type DocumentKind } from './schema'

/** The number this record's document was issued under, or `null` if it has
 * never been printed. */
export async function getIssuedDocument(kind: DocumentKind, recordId: string) {
  return issuedDocumentSchema.nullable().parse(await api('GET', '/api/prisons/documents/issued', { query: { kind, recordId } }))
}

/** Issues the document (first print) or records a reprint. The node decides
 * the number; the same number always comes back for the same record. */
export async function issueDocument(input: { kind: DocumentKind; recordId: string }) {
  return issuedDocumentSchema.parse(await api('POST', '/api/prisons/documents/issue', { body: input }))
}
