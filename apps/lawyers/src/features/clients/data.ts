import { api, seg } from '@/lib/api'
import * as z from 'zod'
import { clientSchema, clientSummarySchema, type ClientInput } from './schema'

export async function listClients(query = '') {
  return z.array(clientSummarySchema).parse(await api('GET', '/api/clients', { query: { query } }))
}

export async function createClient(input: ClientInput) {
  return clientSchema.parse(await api('POST', '/api/clients', { body: input }))
}

export async function updateClient(id: string, input: ClientInput) {
  return clientSchema.parse(await api('PUT', `/api/clients/${seg(id)}`, { body: input }))
}
