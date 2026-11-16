import { ugPack } from './ug'
import type { JurisdictionPack } from './pack'
import { m } from '@/paraglide/messages'

export type { JurisdictionPack } from './pack'
export { ugPack, ugRegions, ugMandatoryBailDays } from './ug'

const packs: ReadonlyMap<string, JurisdictionPack> = new Map([['ug', ugPack]])

/** New installations default to Uganda. An unknown stored id is an error,
 * never permission to substitute another country's law. */
export function jurisdictionPack(id: string | null | undefined): JurisdictionPack {
  if (id == null) return ugPack
  const pack = packs.get(id)
  if (!pack) throw new Error(m.jurisdiction_unknown({ id }))
  return pack
}

/** Roadmap entries deliberately cannot be used as operational packs. */
export const plannedJurisdictions = [
  { id: 'cd', name: () => m.jurisdiction_cd_name(), priority: 2 },
  { id: 'ke', name: () => m.jurisdiction_ke_name(), priority: 3 },
] as const
