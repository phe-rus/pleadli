import * as m from '@/paraglide/messages'
import { api, DEV_API_URL } from '@/lib/api'
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
const DEV_SERVER_URL = DEV_API_URL

export async function createPerson(input: CreatePersonInput) {
  const parsed = createPersonSchema.parse(input)
  const person = await api('/people', { method: 'POST', body: JSON.stringify(parsed) })
  return personSchema.parse(person)
}

export async function updatePerson(id: string, input: CreatePersonInput) {
  const parsed = createPersonSchema.parse(input)
  const person = await api(`/people/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      })
  return personSchema.parse(person)
}

export async function searchPeople(query: string) {
  const people = await api(`/people?query=${encodeURIComponent(query)}`)
  return z.array(personSchema).parse(people)
}

export async function getPerson(id: string) {
  const person = await api(`/people/${encodeURIComponent(id)}`)
  return personSchema.nullable().parse(person)
}

export async function getPersonProfile(id: string) {
  const profile = await api(`/people/${encodeURIComponent(id)}/profile`)
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
      filters: [{ name: format === 'pdf' ? m["common.pdf_document"]() : m["common.word_document"](), extensions: [format] }],
    })
    if (typeof path !== 'string') return false
    await invoke('export_person_document', { id, format, destinationPath: path })
    return true
  }
  window.open(`${DEV_SERVER_URL}/people/${encodeURIComponent(id)}/export/${format}`, '_blank')
  return true
}
