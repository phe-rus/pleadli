import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { chargeSchema, createChargeSchema, type CreateChargeInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createCharge(input: CreateChargeInput) {
  const parsed = createChargeSchema.parse(input)
  const rustInput = { ...parsed, statutorySection: parsed.statutorySection || null, particulars: parsed.particulars || null }
  const charge = isTauri()
    ? await invoke('create_charge', { input: rustInput })
    : await devFetch('/charges', { method: 'POST', body: JSON.stringify(rustInput) })
  return chargeSchema.parse(charge)
}

export async function listChargesForFile(prosecutionFileId: string) {
  const charges = isTauri()
    ? await invoke('list_charges_for_file', { prosecutionFileId })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/charges`)
  return z.array(chargeSchema).parse(charges)
}
