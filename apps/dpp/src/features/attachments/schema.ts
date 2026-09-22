import * as z from 'zod'

export const entityTypes = {
  person: 'person',
  prosecutionFile: 'prosecution_file',
  statement: 'statement',
  evidenceItem: 'evidence_item',
} as const

export type EntityType = (typeof entityTypes)[keyof typeof entityTypes]

export const attachmentSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  createdAt: z.number(),
})

export type Attachment = z.infer<typeof attachmentSchema>

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
