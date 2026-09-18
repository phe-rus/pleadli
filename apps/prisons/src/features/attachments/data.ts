import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { api } from '@/lib/api'
import { attachmentSchema, type Attachment } from './schema'

export async function listAttachments(entityType: string, entityId: string) {
  const rows = await api('GET', '/api/prisons/documents', { query: { entityType, entityId } })
  return z.array(attachmentSchema).parse(rows)
}

export async function addAttachment(entityType: string, entityId: string, file: { fileName: string; contentBase64: string }) {
  const body = { entityType, entityId, fileName: file.fileName, contentBase64: file.contentBase64 }
  return attachmentSchema.parse(await api('POST', '/api/prisons/documents', { body }))
}

export type PickedFile = { fileName: string; contentBase64: string }

/** The native file dialog, in the desktop app. It returns the file's bytes
 * to the webview; the webview never names a path, so it cannot read a file
 * the officer did not choose. */
export async function pickFileNative() {
  return invoke<PickedFile | null>('pick_file')
}

export async function readBrowserFile(file: File): Promise<PickedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return { fileName: file.name, contentBase64: btoa(binary) }
}

/** Documents are never deleted: voiding keeps the file and the row, and
 * records who voided it and why. */
export async function voidAttachment(id: string, reason: string) {
  await api('POST', `/api/prisons/documents/${encodeURIComponent(id)}/void`, { body: { reason } })
}

export async function getAttachmentDataUrl(id: string) {
  const url = await api('GET', `/api/prisons/documents/${encodeURIComponent(id)}/data-url`)
  return typeof url === 'string' ? url : null
}

export async function openAttachment(attachment: Attachment) {
  if (isTauri()) {
    // Only valid while the node runs on this machine; the document reader
    // in the documents slice replaces this for workstations.
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(attachment.storedPath)
    return
  }
  const url = await getAttachmentDataUrl(attachment.id)
  if (url) window.open(url, '_blank')
}
