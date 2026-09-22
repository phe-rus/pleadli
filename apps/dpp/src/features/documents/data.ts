import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { api, devExportUrl, seg } from '@/lib/api'
import { documentSchema, type ExportFormat } from './schema'

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

export async function issueDocument(id: string) {
  return documentSchema.parse(await api('POST', `/api/documents/${seg(id)}/issue`))
}

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
  if (!response.ok) throw new Error('The export failed.')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = `document.${format}`
  link.click()
  URL.revokeObjectURL(url)
  return true
}
