import { DEV_API_URL, api } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { attachmentSchema, bulkAttachResultSchema, type Attachment, type PersonPhotoAngle } from './schema'

const DEV_SERVER_URL = DEV_API_URL

export async function listAttachments(entityType: string, entityId: string) {
  const attachments = isTauri()
    ? await invoke('list_attachments', { entityType, entityId })
    : await (
        await fetch(
          `${DEV_SERVER_URL}/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        )
      ).json()
  return z.array(attachmentSchema).parse(attachments)
}

export async function listAllAttachments(query: string) {
  const attachments = isTauri()
    ? await invoke('list_all_attachments', { query })
    : await (await fetch(`${DEV_SERVER_URL}/attachments/all?query=${encodeURIComponent(query)}`)).json()
  return z.array(attachmentSchema).parse(attachments)
}

export async function getAttachmentRoute(entityType: string, entityId: string) {
  const route = isTauri()
    ? await invoke('get_attachment_route', { entityType, entityId })
    : await (
        await fetch(
          `${DEV_SERVER_URL}/attachments/route?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`,
        )
      ).json()
  return z.string().parse(route)
}

export async function addAttachmentFromPath(entityType: string, entityId: string, sourcePath: string) {
  const attachment = await invoke('add_attachment', { entityType, entityId, sourcePath })
  return attachmentSchema.parse(attachment)
}

export async function addAttachmentFile(entityType: string, entityId: string, file: File) {
  const formData = new FormData()
  formData.append('entityType', entityType)
  formData.append('entityId', entityId)
  formData.append('file', file)
  const response = await fetch(`${DEV_SERVER_URL}/attachments`, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(await response.text())
  return attachmentSchema.parse(await response.json())
}

export async function deleteAttachment(id: string) {
  if (isTauri()) {
    await invoke('delete_attachment', { id })
    return
  }
  const response = await fetch(`${DEV_SERVER_URL}/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await response.text())
}

export function attachmentFileUrl(id: string) {
  return `${DEV_SERVER_URL}/attachments/${encodeURIComponent(id)}/file`
}

/**
 * A URL usable directly in `<img src>` that works the same in a real
 * release build as in dev: the dev-only HTTP server behind
 * `attachmentFileUrl` doesn't exist once `debug_assertions` is off, so
 * inline display (an avatar, say) needs the actual bytes as a `data:`
 * URL from Rust instead, in Tauri. The plain browser-dev fallback can
 * just use the existing file URL directly.
 */
export async function getAttachmentDataUrl(id: string) {
  if (!isTauri()) return attachmentFileUrl(id)
  const url = await invoke('get_attachment_data_url', { id })
  return typeof url === 'string' ? url : null
}

export async function setPersonPhoto(id: string, angle: PersonPhotoAngle, input: { path: string } | { file: File }) {
  if (isTauri()) {
    if (!('path' in input)) throw new Error('Tauri requires a file path')
    const attachment = await invoke('set_person_photo_from_path', { id, angle, sourcePath: input.path })
    return attachmentSchema.parse(attachment)
  }
  if (!('file' in input)) throw new Error('Browser dev mode requires a File')
  const formData = new FormData()
  formData.append('angle', angle)
  formData.append('file', input.file)
  const response = await fetch(`${DEV_SERVER_URL}/people/${encodeURIComponent(id)}/photos`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(await response.text())
  return attachmentSchema.parse(await response.json())
}

export async function clearPersonPhoto(id: string, angle: PersonPhotoAngle) {
  await api(`/people/${encodeURIComponent(id)}/photos/${encodeURIComponent(angle)}`, { method: 'DELETE' })
}

/**
 * Bulk paperwork intake: attaches many files to one entity at once, for an
 * existing person's file or a case's supporting documents, instead of one
 * file at a time. Each file lands wherever `resolve_vault_dir` already
 * puts a single attachment for that entity; a per-file failure doesn't
 * abort the batch, it comes back in `failed`.
 */
export async function bulkAttachFiles(entityType: string, entityId: string, input: { paths: string[] } | { files: File[] }) {
  if (isTauri()) {
    if (!('paths' in input)) throw new Error('Tauri requires file paths')
    const result = await invoke('bulk_attach_files', { entityType, entityId, sourcePaths: input.paths })
    return bulkAttachResultSchema.parse(result)
  }
  if (!('files' in input)) throw new Error('Browser dev mode requires Files')
  const formData = new FormData()
  formData.append('entityType', entityType)
  formData.append('entityId', entityId)
  for (const file of input.files) formData.append('file', file)
  const response = await fetch(`${DEV_SERVER_URL}/attachments/bulk`, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(await response.text())
  return bulkAttachResultSchema.parse(await response.json())
}

export async function openAttachment(attachment: Attachment) {
  if (isTauri()) {
    // The window names the attachment; the app works out where it is on disk.
    await invoke('open_attachment', { id: attachment.id })
    return
  }
  window.open(attachmentFileUrl(attachment.id), '_blank')
}
