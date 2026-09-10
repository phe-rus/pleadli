import * as z from 'zod'

export const vaultEntrySchema = z.object({
  name: z.string(),
  relativePath: z.string(),
  isDir: z.boolean(),
  sizeBytes: z.number().nullable(),
  modifiedAt: z.number().nullable(),
  attachmentId: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  mimeType: z.string().nullable(),
  absolutePath: z.string(),
})

export type VaultEntry = z.infer<typeof vaultEntrySchema>

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Splits a relative vault path into breadcrumb segments the file
 * manager can navigate with, e.g. "cases/CRB-123-2026/documents" ->
 * [{label:'cases', path:'cases'}, {label:'CRB-123-2026', path:'cases/CRB-123-2026'}, ...]. */
export function pathSegments(relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean)
  return parts.map((label, index) => ({
    label,
    path: parts.slice(0, index + 1).join('/'),
  }))
}
