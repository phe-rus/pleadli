import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createReviewNoteSchema, reviewNoteSchema, type CreateReviewNoteInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createReviewNote(input: CreateReviewNoteInput) {
  const parsed = createReviewNoteSchema.parse(input)
  const rustInput = { ...parsed, author: parsed.author || null, note: parsed.note || null }
  const note = isTauri()
    ? await invoke('create_review_note', { input: rustInput })
    : await devFetch('/review-notes', { method: 'POST', body: JSON.stringify(rustInput) })
  return reviewNoteSchema.parse(note)
}

export async function listReviewNotesForFile(prosecutionFileId: string) {
  const notes = isTauri()
    ? await invoke('list_review_notes_for_file', { prosecutionFileId })
    : await devFetch(`/prosecution-files/${encodeURIComponent(prosecutionFileId)}/review-notes`)
  return z.array(reviewNoteSchema).parse(notes)
}
