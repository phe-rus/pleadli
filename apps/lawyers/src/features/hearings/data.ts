import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { adjournedSchema, diaryRowSchema, hearingSchema, type AdjournInput, type HearingInput } from './schema'

export async function getDiary(from: number, to: number) {
  return z.array(diaryRowSchema).parse(await api('GET', '/api/diary', { query: { from, to } }))
}

export async function scheduleHearing(matterId: string, input: HearingInput) {
  return hearingSchema.parse(await api('POST', `/api/matters/${seg(matterId)}/hearings`, { body: input }))
}

export async function rescheduleHearing(id: string, input: HearingInput) {
  return hearingSchema.parse(await api('PUT', `/api/hearings/${seg(id)}`, { body: input }))
}

export async function attendHearing(id: string, outcome: string) {
  return hearingSchema.parse(await api('POST', `/api/hearings/${seg(id)}/attend`, { body: { outcome } }))
}

export async function missHearing(id: string, note: string | null) {
  return hearingSchema.parse(await api('POST', `/api/hearings/${seg(id)}/miss`, { body: { note } }))
}

export async function cancelHearing(id: string, note: string | null) {
  return hearingSchema.parse(await api('POST', `/api/hearings/${seg(id)}/cancel`, { body: { note } }))
}

export async function adjournHearing(id: string, input: AdjournInput) {
  return adjournedSchema.parse(await api('POST', `/api/hearings/${seg(id)}/adjourn`, { body: input }))
}
