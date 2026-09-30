import * as m from '@/paraglide/messages'
import { DEV_API_URL } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  bulkImportResultSchema,
  caseResolutionSchema,
  importFieldSchema,
  importPreviewSchema,
  personResolutionSchema,
} from './schema'

const DEV_SERVER_URL = DEV_API_URL

/**
 * Regenerates every record's Markdown fresh, adds an index/README on top,
 * and zips the whole Police Vault. In Tauri, the officer picks where it
 * goes via the native save dialog and Rust writes straight to that path.
 * In the browser-dev fallback (no OS save dialog available) the dev
 * server builds the same zip server-side and hands it back as a normal
 * file download. Returns `false` only when the officer cancels the save
 * dialog. Not an error, just nothing to report.
 */
export async function exportAllMarkdown() {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: 'pleadli-police-vault.zip',
      filters: [{ name: m["common.zip_archive"](), extensions: ['zip'] }],
    })
    if (typeof path !== 'string') return false
    await invoke('export_all_markdown', { destinationPath: path })
    return true
  }
  window.open(`${DEV_SERVER_URL}/export/markdown`, '_blank')
  return true
}

/** One workbook, one sheet per record type. See `exportAllMarkdown` for
 * the Tauri/dev-fallback split. */
export async function exportAllXlsx() {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: 'pleadli-police-data.xlsx',
      filters: [{ name: m["common.excel_workbook"](), extensions: ['xlsx'] }],
    })
    if (typeof path !== 'string') return false
    await invoke('export_all_xlsx', { destinationPath: path })
    return true
  }
  window.open(`${DEV_SERVER_URL}/export/xlsx`, '_blank')
  return true
}

export type DocumentFormat = 'pdf' | 'docx'

/** Every table, one flowing document instead of a workbook: the "plain
 * but organized" PDF/Word tier of the bulk export. See `exportAllMarkdown`
 * for the Tauri/dev-fallback split. */
export async function exportAllDocument(format: DocumentFormat) {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: `pleadli-police-data.${format}`,
      filters: [{ name: format === 'pdf' ? m["common.pdf_document"]() : m["common.word_document"](), extensions: [format] }],
    })
    if (typeof path !== 'string') return false
    await invoke(format === 'pdf' ? 'export_all_pdf' : 'export_all_docx', { destinationPath: path })
    return true
  }
  window.open(`${DEV_SERVER_URL}/export/${format}`, '_blank')
  return true
}

/** The mappable field list for a record type: what `import_fields` in
 * Rust actually knows how to build, so the wizard never offers a target
 * the backend can't accept. */
export async function getImportFields(entityType: string) {
  const fields = isTauri()
    ? await invoke('import_fields', { entityType })
    : await (await fetch(`${DEV_SERVER_URL}/import/fields?entityType=${encodeURIComponent(entityType)}`)).json()
  return z.array(importFieldSchema).parse(fields)
}

/** Reads a CSV/Excel file into headers + every row, as plain strings, for
 * the column-mapping step. In Tauri the officer picks a real file path
 * via the native dialog; the browser-dev fallback uploads the bytes and
 * has the dev server parse a throwaway temp file. */
export async function parseImportFile(input: { path: string } | { file: File }) {
  if (isTauri()) {
    if (!('path' in input)) throw new Error('Tauri requires a file path')
    const preview = await invoke('parse_import_file', { path: input.path })
    return importPreviewSchema.parse(preview)
  }
  if (!('file' in input)) throw new Error('Browser dev mode requires a File')
  const formData = new FormData()
  formData.append('file', input.file)
  const response = await fetch(`${DEV_SERVER_URL}/import/parse`, { method: 'POST', body: formData })
  if (!response.ok) throw new Error(await response.text())
  return importPreviewSchema.parse(await response.json())
}

export type PersonCandidate = {
  key: string
  firstName: string
  lastName: string
  nationalId: string | null
}

/** For every unique (name, national ID) tuple found across the mapped
 * rows: an exact national-ID or exact full-name match, when there's only
 * one, comes back pre-filled; anything else comes back for the officer
 * to pick from `candidates` or choose to create a new person. */
export async function resolvePeople(candidates: PersonCandidate[]) {
  const resolutions = isTauri()
    ? await invoke('resolve_people', { candidates })
    : await (
        await fetch(`${DEV_SERVER_URL}/import/resolve-people`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(candidates),
        })
      ).json()
  return z.array(personResolutionSchema).parse(resolutions)
}

/** For every unique case reference found across the mapped rows: an
 * exact reference match, or nothing. */
export async function resolveCases(references: string[]) {
  const resolutions = isTauri()
    ? await invoke('resolve_cases', { references })
    : await (
        await fetch(`${DEV_SERVER_URL}/import/resolve-cases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(references),
        })
      ).json()
  return z.array(caseResolutionSchema).parse(resolutions)
}

/** The final step: each row (already column-mapped, already
 * person/case-resolved, keyed by the entity's real field names) becomes
 * a real record through the same `create_*` path a hand-typed one would.
 * Never throws for a per-row failure. Bad rows come back in `failed`. */
export async function bulkImport(entityType: string, rows: Record<string, string>[]) {
  const result = isTauri()
    ? await invoke('bulk_import', { entityType, rows })
    : await (
        await fetch(`${DEV_SERVER_URL}/import/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType, rows }),
        })
      ).json()
  return bulkImportResultSchema.parse(result)
}
