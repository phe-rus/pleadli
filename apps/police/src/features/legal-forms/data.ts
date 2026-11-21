import { api, DEV_API_URL } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { chargeSheetSchema, createChargeSheetSchema, type CreateChargeSheetInput } from './schema'

const DEV_SERVER_URL = DEV_API_URL

export async function createChargeSheet(input: CreateChargeSheetInput) {
  const parsed = createChargeSheetSchema.parse(input)
  const chargeSheet = await api('/charge-sheets', { method: 'POST', body: JSON.stringify(parsed) })
  return chargeSheetSchema.parse(chargeSheet)
}

export async function updateChargeSheet(id: string, input: CreateChargeSheetInput) {
  const parsed = createChargeSheetSchema.parse(input)
  const chargeSheet = await api(`/charge-sheets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return chargeSheetSchema.parse(chargeSheet)
}

export async function listChargeSheets(query: string) {
  const chargeSheets = await api(`/charge-sheets?query=${encodeURIComponent(query)}`)
  return z.array(chargeSheetSchema).parse(chargeSheets)
}

export type DocumentFormat = 'pdf' | 'docx'

/** A formatted PDF/Word copy of the PF 53 charge details, for printing
 * or filing. See `people.exportPersonDocument` for the Tauri/dev-fallback
 * split; returns `false` only if the officer cancels the save dialog. */
export async function exportChargeSheetDocument(id: string, format: DocumentFormat) {
  if (isTauri()) {
    const { downloadPath, saidSaved } = await import('@/lib/downloads')
    const path = await downloadPath(`charge-sheet.${format}`)
    await invoke('export_charge_sheet_document', { id, format, destinationPath: path })
    saidSaved(path)
    return true
  }
  window.open(`${DEV_SERVER_URL}/charge-sheets/${encodeURIComponent(id)}/export/${format}`, '_blank')
  return true
}
