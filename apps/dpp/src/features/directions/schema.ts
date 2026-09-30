import * as z from 'zod'
import * as m from '@/paraglide/messages'

// The substance the research confirms is what "further evidence or steps must
// be taken" (RESEARCH.md §3). The other kinds come from the product brief and
// only give the instruction a shape. The server holds the same list.
export const directionKinds = [
  { id: 'missing_material', get label() { return m["direction.kind.missing_material.label"]() }, get hint() { return m["direction.kind.missing_material.hint"]() } },
  { id: 'investigation', get label() { return m["direction.kind.investigation.label"]() }, get hint() { return m["direction.kind.investigation.hint"]() } },
  { id: 'statement', get label() { return m["direction.kind.statement.label"]() }, get hint() { return m["direction.kind.statement.hint"]() } },
  { id: 'evidence', get label() { return m["direction.kind.evidence.label"]() }, get hint() { return m["direction.kind.evidence.hint"]() } },
  { id: 'clarification', get label() { return m["direction.kind.clarification.label"]() }, get hint() { return m["direction.kind.clarification.hint"]() } },
  { id: 'procedural', get label() { return m["direction.kind.procedural.label"]() }, get hint() { return m["direction.kind.procedural.hint"]() } },
  { id: 'other', get label() { return m["direction.kind.other.label"]() }, get hint() { return m["direction.kind.other.hint"]() } },
] as const

export type DirectionKind = (typeof directionKinds)[number]['id']

export function directionKindLabel(kind: string) {
  return directionKinds.find((k) => k.id === kind)?.label ?? kind
}

export const directionSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  decisionId: z.string(),
  kind: z.string(),
  instruction: z.string(),
  personId: z.string().nullable(),
  sortOrder: z.number(),
  response: z.string(),
  responseNote: z.string().nullable(),
  respondedAt: z.number().nullable(),
  createdAt: z.number(),
})

export type Direction = z.infer<typeof directionSchema>

export type DirectionDraft = { kind: DirectionKind; instruction: string; personId: string | null }

export const responses = [
  { id: 'met', get label() { return m["direction.response.met"]() } },
  { id: 'not_met', get label() { return m["direction.response.not_met"]() } },
] as const

export function responseLabel(response: string) {
  return response === 'met' ? m["direction.response.met"]() : response === 'not_met' ? m["direction.response.not_met"]() : m["direction.response.open"]()
}

/** The directions given in one return: those on the same decision act. The
 * server keeps them on the act's first decision row. */
export function directionsOf(directions: readonly Direction[], decisionIds: readonly string[]) {
  return directions.filter((d) => decisionIds.includes(d.decisionId))
}
