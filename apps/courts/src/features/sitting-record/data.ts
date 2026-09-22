import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { appearanceSchema, benchNoteSchema, sittingDetailSchema, type AttendanceInput, type NoteInput } from './schema'

export async function getSitting(id: string) {
  return sittingDetailSchema.parse(await api('GET', `/api/sittings/${seg(id)}`))
}

export async function takeAppearances(sittingId: string) {
  return z.array(appearanceSchema).parse(await api('POST', `/api/sittings/${seg(sittingId)}/appearances/take`))
}

export async function addAppearance(sittingId: string, input: { name: string; role: string }) {
  return appearanceSchema.parse(await api('POST', `/api/sittings/${seg(sittingId)}/appearances`, { body: input }))
}

export async function setAttendance(id: string, input: AttendanceInput) {
  return appearanceSchema.parse(await api('PUT', `/api/appearances/${seg(id)}`, { body: input }))
}

export async function removeAppearance(id: string) {
  await api('DELETE', `/api/appearances/${seg(id)}`)
}

export async function addNote(sittingId: string, input: NoteInput) {
  return benchNoteSchema.parse(await api('POST', `/api/sittings/${seg(sittingId)}/notes`, { body: input }))
}

export async function updateNote(id: string, input: NoteInput) {
  return benchNoteSchema.parse(await api('PUT', `/api/notes/${seg(id)}`, { body: input }))
}

export async function removeNote(id: string) {
  await api('DELETE', `/api/notes/${seg(id)}`)
}

export async function signRecord(sittingId: string) {
  return sittingDetailSchema.parse(await api('POST', `/api/sittings/${seg(sittingId)}/sign`))
}
