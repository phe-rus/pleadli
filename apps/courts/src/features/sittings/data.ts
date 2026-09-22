import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { adjournedSchema, causeListRowSchema, sittingSchema, type AdjournInput, type SittingInput } from './schema'

export async function getCauseList(from: number, to: number) {
  return z.array(causeListRowSchema).parse(await api('GET', '/api/cause-list', { query: { from, to } }))
}

export async function scheduleSitting(caseId: string, input: SittingInput) {
  return sittingSchema.parse(await api('POST', `/api/cases/${seg(caseId)}/sittings`, { body: input }))
}

export async function rescheduleSitting(id: string, input: SittingInput) {
  return sittingSchema.parse(await api('PUT', `/api/sittings/${seg(id)}`, { body: input }))
}

export async function holdSitting(id: string, outcome: string) {
  return sittingSchema.parse(await api('POST', `/api/sittings/${seg(id)}/hold`, { body: { outcome } }))
}

export async function cancelSitting(id: string, note: string | null) {
  return sittingSchema.parse(await api('POST', `/api/sittings/${seg(id)}/cancel`, { body: { note } }))
}

export async function adjournSitting(id: string, input: AdjournInput) {
  return adjournedSchema.parse(await api('POST', `/api/sittings/${seg(id)}/adjourn`, { body: input }))
}
