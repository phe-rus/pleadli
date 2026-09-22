import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { libraryItemSchema, librarySummarySchema, type LibraryInput } from './schema'

export async function listLibrary(query = '', kind = '') {
  return z.array(librarySummarySchema).parse(await api('GET', '/api/library', { query: { query, kind } }))
}

export async function getLibraryItem(id: string) {
  return libraryItemSchema.nullable().parse(await api('GET', `/api/library/${seg(id)}`))
}

export async function addLibraryItem(input: LibraryInput) {
  return libraryItemSchema.parse(await api('POST', '/api/library', { body: input }))
}

export async function updateLibraryItem(id: string, input: LibraryInput) {
  return libraryItemSchema.parse(await api('PUT', `/api/library/${seg(id)}`, { body: input }))
}

export async function removeLibraryItem(id: string) {
  await api('DELETE', `/api/library/${seg(id)}`)
}
