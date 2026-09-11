import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createProsecutionFileSchema,
  prosecutionFilePersonSchema,
  prosecutionFileSchema,
  updateProsecutionFileSchema,
  type CreateProsecutionFileInput,
  type UpdateProsecutionFileInput,
} from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustCreateInput(input: CreateProsecutionFileInput) {
  return {
    ...input,
    odppRegistrationNumber: input.odppRegistrationNumber || null,
    policeStation: input.policeStation || null,
    policeReference: input.policeReference || null,
    materialSummary: input.materialSummary || null,
    notes: input.notes || null,
  }
}

function toRustUpdateInput(input: UpdateProsecutionFileInput) {
  return {
    ...input,
    odppRegistrationNumber: input.odppRegistrationNumber || null,
    policeStation: input.policeStation || null,
    policeReference: input.policeReference || null,
    courtCaseNumber: input.courtCaseNumber || null,
    notes: input.notes || null,
  }
}

export async function createProsecutionFile(input: CreateProsecutionFileInput) {
  const parsed = toRustCreateInput(createProsecutionFileSchema.parse(input))
  const file = isTauri()
    ? await invoke('create_prosecution_file', { input: parsed })
    : await devFetch('/prosecution-files', { method: 'POST', body: JSON.stringify(parsed) })
  return prosecutionFileSchema.parse(file)
}

export async function updateProsecutionFile(id: string, input: UpdateProsecutionFileInput) {
  const parsed = toRustUpdateInput(updateProsecutionFileSchema.parse(input))
  const file = isTauri()
    ? await invoke('update_prosecution_file', { id, input: parsed })
    : await devFetch(`/prosecution-files/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return prosecutionFileSchema.parse(file)
}

export async function listProsecutionFiles(query: string) {
  const files = isTauri()
    ? await invoke('list_prosecution_files', { query })
    : await devFetch(`/prosecution-files?query=${encodeURIComponent(query)}`)
  return z.array(prosecutionFileSchema).parse(files)
}

export async function listIntakeQueue() {
  const files = isTauri()
    ? await invoke('list_intake_queue')
    : await devFetch('/prosecution-files/intake')
  return z.array(prosecutionFileSchema).parse(files)
}

export async function getProsecutionFile(id: string) {
  const file = isTauri()
    ? await invoke('get_prosecution_file', { id })
    : await devFetch(`/prosecution-files/${encodeURIComponent(id)}`)
  return prosecutionFileSchema.nullable().parse(file)
}

export async function linkPersonToFile(prosecutionFileId: string, personId: string, role: string) {
  const link = isTauri()
    ? await invoke('link_person_to_file', { prosecutionFileId, personId, role })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/people`, {
        method: 'POST',
        body: JSON.stringify({ personId, role }),
      })
  return prosecutionFilePersonSchema.parse(link)
}

export async function unlinkPersonFromFile(id: string) {
  if (isTauri()) {
    await invoke('unlink_person_from_file', { id })
  } else {
    await devFetch(`/prosecution-file-people/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
}

export async function listFilePeople(prosecutionFileId: string) {
  const links = isTauri()
    ? await invoke('list_file_people', { prosecutionFileId })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/people`)
  return z.array(prosecutionFilePersonSchema).parse(links)
}
