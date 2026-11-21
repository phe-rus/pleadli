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

export type RuleEdit = {
  value: number | null
  terms: string[]
  exceptions: string[]
  text: string
  citation: string
  status: 'draft' | 'sourced' | 'reviewed'
  reviewedBy: string
  reviewedOn: string
  note: string
}

/** Change one rule. The saved pack is the next version of the rules. Refused with the reason when the rule is
 * not valid (for example "reviewed" with no citation), or the officer is not an administrator. */
export async function editRule(id: string, edit: RuleEdit) {
  return packSchema.parse(await api(`/rules/item/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(edit) }))
}
