import * as m from '@/paraglide/messages'
import * as z from 'zod'

export const unitSchema = z.object({
  id: z.string(),
  kind: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  isLocal: z.boolean(),
  createdAt: z.number(),
})

export type Unit = z.infer<typeof unitSchema>

export const chainSchema = z.object({
  station: unitSchema,
  above: z.array(unitSchema),
})

export type Chain = z.infer<typeof chainSchema>

export const saveChainSchema = z.object({
  region: z.string(),
  district: z.string(),
  division: z.string(),
})

export type SaveChainInput = z.infer<typeof saveChainSchema>

/** The words for a level. Suggestions, not a statement of how the force is
 * organised: the real structure is still to be confirmed with serving
 * officers (docs/police/AUDIT.md section 4). */
export function unitKindLabel(kind: string) {
  const label = ({ region: m["units.kind.region"], district: m["units.kind.district"], division: m["units.kind.division"], station: m["units.kind.station"] } as Record<string, (() => string) | undefined>)[kind]
  return label ? label() : kind
}
