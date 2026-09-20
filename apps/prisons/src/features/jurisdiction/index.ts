import { ugPack } from './ug'
import type { JurisdictionPack } from './pack'

export type { JurisdictionPack } from './pack'
export { ugPack, ugRegions } from './ug'

const packs: Record<string, JurisdictionPack> = { ug: ugPack }

/** The pack for a stored jurisdiction id, or Uganda's if the id is unknown. */
export function jurisdictionPack(id: string | null | undefined): JurisdictionPack {
  return (id && packs[id]) || ugPack
}
