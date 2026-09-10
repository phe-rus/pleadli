import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { bondSchema, createBondSchema, type CreateBondInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustInput(input: CreateBondInput) {
  return {
    ...input,
    lockUpSerialNumber: input.lockUpSerialNumber || null,
    suretyName: input.suretyName || null,
    suretyContact: input.suretyContact || null,
    reportingSchedule: input.reportingSchedule || null,
    officerName: input.officerName || null,
    officerRank: input.officerRank || null,
    notes: input.notes || null,
  }
}

export async function createBond(input: CreateBondInput) {
  const parsed = toRustInput(createBondSchema.parse(input))
  const bond = isTauri()
    ? await invoke('create_bond', { input: parsed })
    : await devFetch('/bonds', { method: 'POST', body: JSON.stringify(parsed) })
  return bondSchema.parse(bond)
}

export async function updateBond(id: string, input: CreateBondInput) {
  const parsed = toRustInput(createBondSchema.parse(input))
  const bond = isTauri()
    ? await invoke('update_bond', { id, input: parsed })
    : await devFetch(`/bonds/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return bondSchema.parse(bond)
}

export async function listBonds(query: string) {
  const bonds = isTauri()
    ? await invoke('list_bonds', { query })
    : await devFetch(`/bonds?query=${encodeURIComponent(query)}`)
  return z.array(bondSchema).parse(bonds)
}
