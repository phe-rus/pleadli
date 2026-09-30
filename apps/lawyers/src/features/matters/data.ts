import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { conflictHitSchema, matterDetailSchema, matterSchema, matterSummarySchema, partySchema, pleaSchema, type MatterInput, type MatterViewId, type PartyInput } from './schema'

export async function listMatters(view: MatterViewId | '' = '', query = '', type = '') {
  return z.array(matterSummarySchema).parse(await api('GET', '/api/matters', { query: { view: view === 'all' ? '' : view === 'board' ? 'open' : view, query, type } }))
}

export async function setStage(id: string, stage: string) {
  return matterSchema.parse(await api('PUT', `/api/matters/${seg(id)}/stage`, { body: { stage } }))
}

export async function addParty(matterId: string, input: PartyInput) {
  return partySchema.parse(await api('POST', `/api/matters/${seg(matterId)}/parties`, { body: input }))
}

export async function updateParty(id: string, input: PartyInput) {
  return partySchema.parse(await api('PUT', `/api/parties/${seg(id)}`, { body: input }))
}

export const removeParty = (id: string) => api('DELETE', `/api/parties/${seg(id)}`)

/** Every client and party of the practice sharing a word with `name`. */
export async function findConflicts(name: string, exceptMatter?: string) {
  return z.array(conflictHitSchema).parse(await api('GET', '/api/conflicts', { query: { name, exceptMatter } }))
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
