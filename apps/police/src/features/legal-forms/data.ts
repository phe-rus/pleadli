import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { chargeSheetSchema, createChargeSheetSchema, type CreateChargeSheetInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createChargeSheet(input: CreateChargeSheetInput) {
  const parsed = createChargeSheetSchema.parse(input)
  const chargeSheet = isTauri()
    ? await invoke('create_charge_sheet', { input: parsed })
    : await devFetch('/charge-sheets', { method: 'POST', body: JSON.stringify(parsed) })
  return chargeSheetSchema.parse(chargeSheet)
}

export async function updateChargeSheet(id: string, input: CreateChargeSheetInput) {
  const parsed = createChargeSheetSchema.parse(input)
  const chargeSheet = isTauri()
    ? await invoke('update_charge_sheet', { id, input: parsed })
    : await devFetch(`/charge-sheets/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return chargeSheetSchema.parse(chargeSheet)
}

export async function listChargeSheets(query: string) {
  const chargeSheets = isTauri()
    ? await invoke('list_charge_sheets', { query })
    : await devFetch(`/charge-sheets?query=${encodeURIComponent(query)}`)
  return z.array(chargeSheetSchema).parse(chargeSheets)
}
