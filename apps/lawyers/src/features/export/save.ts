import { invoke, isTauri } from '@tauri-apps/api/core'

export type ExportKind = 'pdf' | 'docx' | 'doc' | 'csv' | 'zip' | 'json' | 'png' | 'jpg' | 'webp'

const TYPES: Record<ExportKind, { name: string; mime: string }> = {
  pdf: { name: 'PDF', mime: 'application/pdf' },
  docx: { name: 'Word document', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  doc: { name: 'Word document', mime: 'application/msword' },
  csv: { name: 'CSV', mime: 'text/csv' },
  zip: { name: 'ZIP archive', mime: 'application/zip' },
  json: { name: 'JSON', mime: 'application/json' },
  png: { name: 'PNG image', mime: 'image/png' },
  jpg: { name: 'JPEG image', mime: 'image/jpeg' },
  webp: { name: 'WebP image', mime: 'image/webp' },
}

export const kindOfMime = (mime: string): ExportKind | null =>
  ({ 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }) [mime] as ExportKind | null ?? null

/** Saves a file where the person chooses (desktop), or downloads it (browser).
 * False when they cancelled. */
export async function saveFile(bytes: Uint8Array, name: string, kind: ExportKind): Promise<boolean> {
  const file = name.replace(/[^\w.-]+/g, '-')
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({ defaultPath: file, filters: [{ name: TYPES[kind].name, extensions: [kind] }] })
    if (!path) return false
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    await invoke('save_export', { path, kind, data: btoa(binary) })
    return true
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: TYPES[kind].mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = file
  link.click()
  URL.revokeObjectURL(url)
  return true
}
