import { readVaultFile } from '@/features/files/data'
import { api } from '@/lib/api'
import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { binEntrySchema, importResultSchema, libraryEntrySchema, libraryListingSchema, vaultPathOf, type LibraryEntry } from './schema'

type Item = Pick<LibraryEntry, 'kind' | 'id'>
const post = (path: string, body: unknown) => api(path, { method: 'POST', body: JSON.stringify(body) })

// The window and the browser view both reach the library through the app's own
// routes, so they behave the same. Only what needs the computer's files (adding
// by path, saving to Downloads) is the window's own.

export async function listLibrary(folderId: string) {
  return libraryListingSchema.parse(await api(`/library?folderId=${encodeURIComponent(folderId)}`))
}
export async function searchLibrary(query: string) {
  return z.array(libraryEntrySchema).parse(await api(`/library/search?q=${encodeURIComponent(query)}`))
}
export async function createLibraryFolder(parentId: string, name: string) {
  return libraryEntrySchema.parse(await post('/library/folders', { parentId, name }))
}
export async function renameLibraryItem(entry: Item, name: string) {
  await post('/library/rename', { kind: entry.kind, id: entry.id, name })
}
export async function moveLibraryItem(entry: Item, destinationId: string) {
  await post('/library/move', { kind: entry.kind, id: entry.id, destinationId })
}
export async function deleteLibraryItem(entry: Item) {
  await post('/library/delete', { kind: entry.kind, id: entry.id })
}
export async function listBin() {
  return z.array(binEntrySchema).parse(await api('/library/bin'))
}
export async function restoreFromBin(entry: Item) {
  await post('/library/restore', { kind: entry.kind, id: entry.id })
}
export async function purgeFromBin(entry: Item) {
  await post('/library/purge', { kind: entry.kind, id: entry.id })
}
export async function emptyBin() {
  return z.number().parse(await post('/library/bin/empty', {}))
}

/** Adds files and folders by their path on this computer (the window only). */
export async function importIntoLibrary(folderId: string, sourcePaths: string[]) {
  return importResultSchema.parse(await invoke('library_import', { folderId, sourcePaths }))
}

/** Adds files the page already holds (chosen or dropped in the browser view). */
export async function addLibraryFiles(folderId: string, files: File[]) {
  const failed: string[] = []
  let added = 0
  for (const file of files) {
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      await post('/library/files', { folderId, fileName: file.name, dataBase64 })
      added += 1
    } catch {
      failed.push(file.name)
    }
  }
  return { files: added, folders: 0, failed }
}

/** A file, or a folder as a .zip, written at the path `downloads_path` approved (the window only). */
export async function exportLibraryItem(entry: Item, destinationPath: string) {
  if (!isTauri()) throw new Error('Saving to Downloads is done in the Pleadli Police window.')
  await invoke('library_export', { kind: entry.kind, id: entry.id, destinationPath })
}

/** A library file as a `data:` URL for the app's own viewer. */
export async function readLibraryFile(entry: Pick<LibraryEntry, 'id' | 'name'>): Promise<string> {
  return readVaultFile(vaultPathOf(entry))
}
