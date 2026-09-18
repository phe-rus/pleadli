import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createTransferSchema, transferSchema, type CreateTransferInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createTransfer(input: CreateTransferInput) {
  const parsed = createTransferSchema.parse(input)
  const rustInput = {
    ...parsed,
    otherPrisonName: parsed.otherPrisonName || null,
    orderingAuthority: parsed.orderingAuthority || null,
    notes: parsed.notes || null,
  }
  const transfer = isTauri()
    ? await invoke('create_transfer', { input: rustInput })
    : await devFetch('/transfers', { method: 'POST', body: JSON.stringify(rustInput) })
  return transferSchema.parse(transfer)
}

export async function listTransfersForPrisoner(prisonerId: string) {
  const transfers = isTauri()
    ? await invoke('list_transfers_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/transfers`)
  return z.array(transferSchema).parse(transfers)
}
