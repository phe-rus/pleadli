import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { documentSchema, documentSummarySchema, verificationSchema, type CreateDocumentInput, type UpdateDocumentInput } from './schema'

export async function listDocuments(status = '') {
  return z.array(documentSummarySchema).parse(await api('GET', '/api/documents', { query: { status } }))
}

export async function getDocument(id: string) {
  return documentSchema.nullable().parse(await api('GET', `/api/documents/${seg(id)}`))
}

export async function createDocument(input: CreateDocumentInput) {
  return documentSchema.parse(await api('POST', '/api/documents', { body: input }))
}

export async function updateDocument(id: string, input: UpdateDocumentInput) {
  return documentSchema.parse(await api('PUT', `/api/documents/${seg(id)}`, { body: input }))
}

export async function discardDocument(id: string) {
  await api('DELETE', `/api/documents/${seg(id)}`)
}

export async function fileDocument(id: string, input: { filedOn: number; filedWith: string | null }) {
  return documentSchema.parse(await api('POST', `/api/documents/${seg(id)}/file`, { body: input }))
}

export async function verifyDocument(reference: string, code: string) {
  return verificationSchema.parse(await api('POST', '/api/documents/verify', { body: { reference, code } }))
}
