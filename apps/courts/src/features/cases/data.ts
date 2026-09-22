import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { caseDetailSchema, caseSchema, caseSummarySchema, partySchema, type CaseInput, type CaseViewId, type PartyInput } from './schema'

export async function listCases(view: CaseViewId | '' = '', query = '') {
  return z.array(caseSummarySchema).parse(await api('GET', '/api/cases', { query: { view: view === 'all' ? '' : view, query } }))
}

export async function getCase(id: string) {
  return caseDetailSchema.parse(await api('GET', `/api/cases/${seg(id)}`))
}

export async function createCase(input: CaseInput) {
  return caseSchema.parse(await api('POST', '/api/cases', { body: input }))
}

export async function updateCase(id: string, input: CaseInput) {
  return caseSchema.parse(await api('PUT', `/api/cases/${seg(id)}`, { body: input }))
}

export async function concludeCase(id: string, outcome: string) {
  return caseSchema.parse(await api('POST', `/api/cases/${seg(id)}/conclude`, { body: { outcome } }))
}

export async function reopenCase(id: string) {
  return caseSchema.parse(await api('POST', `/api/cases/${seg(id)}/reopen`))
}

export async function addParty(caseId: string, input: PartyInput) {
  return partySchema.parse(await api('POST', `/api/cases/${seg(caseId)}/parties`, { body: input }))
}

export async function updateParty(id: string, input: PartyInput) {
  return partySchema.parse(await api('PUT', `/api/parties/${seg(id)}`, { body: input }))
}

export async function removeParty(id: string) {
  await api('DELETE', `/api/parties/${seg(id)}`)
}
