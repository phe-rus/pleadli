import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createPersonSchema, personSchema, type CreatePersonInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustInput(input: CreatePersonInput) {
  return {
    ...input,
    otherNames: input.otherNames || null,
    phone: input.phone || null,
    nationalId: input.nationalId || null,
    address: input.address || null,
  }
}

export async function createPerson(input: CreatePersonInput) {
  const parsed = toRustInput(createPersonSchema.parse(input))
  const person = isTauri()
    ? await invoke('create_person', { input: parsed })
    : await devFetch('/people', { method: 'POST', body: JSON.stringify(parsed) })
  return personSchema.parse(person)
}

export async function updatePerson(id: string, input: CreatePersonInput) {
  const parsed = toRustInput(createPersonSchema.parse(input))
  const person = isTauri()
    ? await invoke('update_person', { id, input: parsed })
    : await devFetch(`/people/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return personSchema.parse(person)
}

export async function searchPeople(query: string) {
  const people = isTauri()
    ? await invoke('search_people', { query })
    : await devFetch(`/people?query=${encodeURIComponent(query)}`)
  return z.array(personSchema).parse(people)
}
