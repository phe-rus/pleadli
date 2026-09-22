import * as z from 'zod'
import { api, orNull, seg } from '@/lib/api'
import { createReviewNoteSchema, reviewNoteSchema, type CreateReviewNoteInput } from './schema'

export async function createReviewNote(input: CreateReviewNoteInput) {
  const parsed = createReviewNoteSchema.parse(input)
  const body = { ...parsed, author: orNull(parsed.author), note: orNull(parsed.note) }
  return reviewNoteSchema.parse(await api('POST', '/api/review-notes', { body }))
}

export async function listReviewNotesForFile(prosecutionFileId: string) {
  return z.array(reviewNoteSchema).parse(await api('GET', `/api/prosecution-files/${seg(prosecutionFileId)}/review-notes`))
}
