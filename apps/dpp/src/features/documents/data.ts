import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import * as m from '@/paraglide/messages'
import { api, devExportUrl, seg } from '@/lib/api'
import { documentSchema, type DocumentContent, type ExportFormat } from './schema'

export async function listDocuments(fileId?: string) {
  return z.array(documentSchema).parse(await api('GET', '/api/documents', { query: { fileId } }))
}

export async function getDocument(id: string) {
  return documentSchema.parse(await api('GET', `/api/documents/${seg(id)}`))
}

/** Prepares the document a decision produces, or returns the one that exists. */
export async function prepareDocument(decisionId: string) {
  return documentSchema.parse(await api('POST', '/api/documents', { body: { decisionId } }))
}

export async function refreshDocument(id: string) {
  return documentSchema.parse(await api('POST', `/api/documents/${seg(id)}/refresh`))
}

/** Issues a draft, its reference starting in the country's style ("ODPP", "PARQUET"). */
export async function issueDocument({ id, prefix }: { id: string; prefix?: string }) {
  return documentSchema.parse(await api('POST', `/api/documents/${seg(id)}/issue`, { body: { prefix } }))
}

/** A draft made on the screen from a country template. */
export async function createDraft(input: { prosecutionFileId: string; decisionId: string | null; kind: string; title: string; content: DocumentContent }) {
  return documentSchema.parse(await api('POST', '/api/documents/draft', { body: input }))
}

export async function saveContent({ id, title, content }: { id: string; title: string; content: DocumentContent }) {
  return documentSchema.parse(await api('PUT', `/api/documents/${seg(id)}/content`, { body: { title, content } }))
}

export const verificationSchema = z.object({
  found: z.boolean(),
  genuine: z.boolean(),
  title: z.string().nullable(),
  fileTitle: z.string().nullable(),
  author: z.string().nullable(),
  issuedAt: z.number().nullable(),
})
export async function verifyDocument(reference: string, code: string) {
  return verificationSchema.parse(await api('GET', '/api/documents/verify', { query: { reference, code } }))
}

export const sealsSchema = z.object({ signature: z.string().nullable(), stamp: z.string().nullable() })
export const getSeals = async () => sealsSchema.parse(await api('GET', '/api/seals'))
export const setSignature = (image: string | null) => api('PUT', '/api/seals/signature', { body: { image } })
export const setStamp = (image: string | null) => api('PUT', '/api/seals/stamp', { body: { image } })

export async function discardDocument(id: string) {
  await api('DELETE', `/api/documents/${seg(id)}`)
}

/** Saves an export. On the desktop the file goes where the prosecutor chooses,
 * made by the backend from the stored content; in a browser it downloads. */
export async function saveExport(id: string, format: ExportFormat): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const name = await invoke<string>('document_export_name', { id, format })
    const path = await save({ defaultPath: name })
    if (!path) return false
    await invoke('save_document_export', { id, format, path })
    return true
  }
  const response = await fetch(devExportUrl(id, format))
  if (!response.ok) throw new Error(m["doc.export_failed"]())
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `document.${format}`
  link.click()
  URL.revokeObjectURL(url)
  return true
}
