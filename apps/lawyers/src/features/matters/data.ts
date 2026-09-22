import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { matterDetailSchema, matterSchema, matterSummarySchema, pleaSchema, type MatterInput, type MatterViewId } from './schema'

export async function listMatters(view: MatterViewId | '' = '', query = '') {
  return z.array(matterSummarySchema).parse(await api('GET', '/api/matters', { query: { view: view === 'all' ? '' : view, query } }))
}

export async function getMatter(id: string) {
  return matterDetailSchema.parse(await api('GET', `/api/matters/${seg(id)}`))
}

export async function createMatter(input: MatterInput) {
  return matterSchema.parse(await api('POST', '/api/matters', { body: input }))
}

export async function updateMatter(id: string, input: MatterInput) {
  return matterSchema.parse(await api('PUT', `/api/matters/${seg(id)}`, { body: input }))
}

export async function closeMatter(id: string, outcome: string) {
  return matterSchema.parse(await api('POST', `/api/matters/${seg(id)}/close`, { body: { outcome } }))
}

export async function reopenMatter(id: string) {
  return matterSchema.parse(await api('POST', `/api/matters/${seg(id)}/reopen`))
}

export async function savePlea(matterId: string, input: PleaInput) {
  return pleaSchema.parse(await api('PUT', `/api/matters/${seg(matterId)}/plea`, { body: input }))
}

export type PleaInput = {
  status: string
  summary: string | null
  explainedOn: number | null
  explainedBy: string | null
  signedOn: number | null
  confirmedOn: number | null
  abandonedReason: string | null
}
