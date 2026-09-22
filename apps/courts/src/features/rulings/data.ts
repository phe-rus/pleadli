import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { rulingSchema, rulingSummarySchema, type CreateRulingInput, type UpdateRulingInput } from './schema'

export async function getRulings(status = '') {
  return z.array(rulingSummarySchema).parse(await api('GET', '/api/rulings', { query: { status } }))
}

export async function getRuling(id: string) {
  return rulingSchema.nullable().parse(await api('GET', `/api/rulings/${seg(id)}`))
}

export async function createRuling(input: CreateRulingInput) {
  return rulingSchema.parse(await api('POST', '/api/rulings', { body: input }))
}

export async function updateRuling(id: string, input: UpdateRulingInput) {
  return rulingSchema.parse(await api('PUT', `/api/rulings/${seg(id)}`, { body: input }))
}

export async function discardRuling(id: string) {
  await api('DELETE', `/api/rulings/${seg(id)}`)
}

export async function deliverRuling(id: string, deliveredOn: number) {
  return rulingSchema.parse(await api('POST', `/api/rulings/${seg(id)}/deliver`, { body: { deliveredOn } }))
}
