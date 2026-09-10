import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createPersonSchema,
  personProfileSchema,
  personSchema,
  type CreatePersonInput,
  type Person,
} from './schema'

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

export async function getPersonProfile(id: string) {
  const profile = isTauri()
    ? await invoke('get_person_profile', { id })
    : await devFetch(`/people/${encodeURIComponent(id)}/profile`)
  return personProfileSchema.nullable().parse(profile)
}

export function personFullName(person: Pick<Person, 'firstName' | 'lastName' | 'otherNames'>) {
  return [person.lastName, person.firstName, person.otherNames].filter(Boolean).join(', ')
}

export type DocumentFormat = 'pdf' | 'docx'

/**
 * A formatted PDF/Word copy of this person's whole record (identity,
 * headshot, and every related case/statement/custody/etc.), for
 * printing, filing, or sending on, distinct from the interactive profile
 * page. In Tauri, the officer picks the destination via the native save
 * dialog; the browser-dev fallback downloads it from the dev server
 * directly. Returns `false` only if the officer cancels the save dialog.
 */
export async function exportPersonDocument(id: string, format: DocumentFormat) {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      defaultPath: `person-record.${format}`,
      filters: [{ name: format === 'pdf' ? 'PDF Document' : 'Word Document', extensions: [format] }],
    })
    if (typeof path !== 'string') return false
    await invoke('export_person_document', { id, format, destinationPath: path })
    return true
  }
  window.open(`${DEV_SERVER_URL}/people/${encodeURIComponent(id)}/export/${format}`, '_blank')
  return true
}
