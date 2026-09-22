import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { api, devAttachmentUrl, devUploadUrl, seg } from '@/lib/api'
import { attachmentSchema } from './schema'

export async function listAttachments(entityType: string, entityId: string) {
  return z.array(attachmentSchema).parse(await api('GET', '/api/attachments', { query: { entityType, entityId } }))
}

/** Desktop: the file was chosen in the operating system's dialog, so the
 * backend reads it by path and the webview never handles the bytes. */
export async function addAttachmentFromPath(entityType: string, entityId: string, sourcePath: string) {
  return attachmentSchema.parse(await invoke('add_attachment', { entityType, entityId, sourcePath }))
}

/** Browser during development only. */
export async function addAttachmentFile(entityType: string, entityId: string, file: File) {
  const formData = new FormData()
  formData.append('entityType', entityType)
  formData.append('entityId', entityId)
  formData.append('file', file)
  const response = await fetch(devUploadUrl, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(((await response.json().catch(() => null)) as { message?: string } | null)?.message ?? 'The upload failed.')
  return attachmentSchema.parse(await response.json())
}

export async function deleteAttachment(id: string) {
  await api('DELETE', `/api/attachments/${seg(id)}`)
}

export async function getAttachmentDataUrl(id: string) {
  if (!isTauri()) return devAttachmentUrl(id)
  const url = await invoke('get_attachment_data_url', { id })
  return typeof url === 'string' ? url : null
}

/** Opens the file in the program the system associates with it. The backend
 * resolves the location from the id; the UI never sees a path into the vault. */
export async function openAttachment(attachment: { id: string }) {
  if (isTauri()) {
    await invoke('open_attachment', { id: attachment.id })
    return
  }
  window.open(devAttachmentUrl(attachment.id), '_blank')
}
