import { api } from '@/lib/api'
import { packSchema } from './schema'

export async function getRules() {
  return packSchema.parse(await api('/rules'))
}

/** Load a newer rules pack from its text. Refused with the reason when it is not valid, not newer, or
 * the officer is not an administrator. */
export async function importRules(json: string) {
  return packSchema.parse(await api('/rules/import', { method: 'POST', body: json }))
}
