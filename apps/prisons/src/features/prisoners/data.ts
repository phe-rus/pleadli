import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createPrisonerSchema,
  prisonerSchema,
  updatePrisonerSchema,
  type CreatePrisonerInput,
  type UpdatePrisonerInput,
} from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustCreateInput(input: CreatePrisonerInput) {
  return {
    ...input,
    otherNames: input.otherNames || null,
    nationalId: input.nationalId || null,
    reference: input.reference || null,
    admissionAuthority: input.admissionAuthority || null,
    notes: input.notes || null,
  }
}

function toRustUpdateInput(input: UpdatePrisonerInput) {
  return {
    ...input,
    otherNames: input.otherNames || null,
    nationalId: input.nationalId || null,
    reference: input.reference || null,
    notes: input.notes || null,
  }
}

export async function createPrisoner(input: CreatePrisonerInput) {
  const parsed = toRustCreateInput(createPrisonerSchema.parse(input))
  const prisoner = isTauri()
    ? await invoke('create_prisoner', { input: parsed })
    : await devFetch('/prisoners', { method: 'POST', body: JSON.stringify(parsed) })
  return prisonerSchema.parse(prisoner)
}

export async function updatePrisoner(id: string, input: UpdatePrisonerInput) {
  const parsed = toRustUpdateInput(updatePrisonerSchema.parse(input))
  const prisoner = isTauri()
    ? await invoke('update_prisoner', { id, input: parsed })
    : await devFetch(`/prisoners/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return prisonerSchema.parse(prisoner)
}

export async function listPrisoners(query: string) {
  const prisoners = isTauri()
    ? await invoke('list_prisoners', { query })
    : await devFetch(`/prisoners?query=${encodeURIComponent(query)}`)
  return z.array(prisonerSchema).parse(prisoners)
}

export async function listInCustody() {
  const prisoners = isTauri() ? await invoke('list_in_custody') : await devFetch('/prisoners/in-custody')
  return z.array(prisonerSchema).parse(prisoners)
}

export async function getPrisoner(id: string) {
  const prisoner = isTauri() ? await invoke('get_prisoner', { id }) : await devFetch(`/prisoners/${encodeURIComponent(id)}`)
  return prisonerSchema.nullable().parse(prisoner)
}
