import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createPersonSchema, personSchema, type CreatePersonInput, type Person } from './schema'

// Only reachable in a dev build (see src-tauri/src/server.rs) — lets the
// plain browser dev server (no Tauri IPC bridge) exercise the same data
// layer against the real local database during development.
const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createPerson(input: CreatePersonInput) {
  const parsed = createPersonSchema.parse(input)
  const person = isTauri()
    ? await invoke('create_person', { input: parsed })
    : await devFetch('/people', { method: 'POST', body: JSON.stringify(parsed) })
  return personSchema.parse(person)
}

export async function updatePerson(id: string, input: CreatePersonInput) {
  const parsed = createPersonSchema.parse(input)
  const person = isTauri()
    ? await invoke('update_person', { id, input: parsed })
    : await devFetch(`/people/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      })
  return personSchema.parse(person)
}

export async function searchPeople(query: string) {
  const people = isTauri()
    ? await invoke('search_people', { query })
    : await devFetch(`/people?query=${encodeURIComponent(query)}`)
  return z.array(personSchema).parse(people)
}

export async function getPerson(id: string) {
  const person = isTauri()
    ? await invoke('get_person', { id })
    : await devFetch(`/people/${encodeURIComponent(id)}`)
  return personSchema.nullable().parse(person)
}

export function personFullName(person: Pick<Person, 'firstName' | 'lastName' | 'otherNames'>) {
  return [person.lastName, person.firstName, person.otherNames].filter(Boolean).join(', ')
}
