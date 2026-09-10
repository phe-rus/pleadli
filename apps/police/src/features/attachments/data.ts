import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { attachmentSchema, type Attachment } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

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

export async function openAttachment(attachment: Attachment) {
  if (isTauri()) {
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(attachment.storedPath)
    return
  }
  window.open(attachmentFileUrl(attachment.id), '_blank')
}
