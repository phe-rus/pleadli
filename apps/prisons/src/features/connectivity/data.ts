import { api } from '@/lib/api'
import { connectivityStatusSchema } from './schema'

export async function getConnectivityStatus() {
  return connectivityStatusSchema.parse(await api('GET', '/api/system/network/status'))
}

/** Ends the link to Head Office. Local records, officers and audit stay. */
export async function disconnectFromHeadOffice() {
  return connectivityStatusSchema.parse(await api('POST', '/api/system/network/disconnect'))
}

export async function setSyncClass(input: { class: string; enabled: boolean }) {
  return connectivityStatusSchema.parse(await api('PUT', `/api/system/network/sync-classes/${input.class}`, { body: { enabled: input.enabled } }))
}
