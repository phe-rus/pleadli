import * as z from 'zod'

// The substance the research confirms is what "further evidence or steps must
// be taken" (RESEARCH.md §3). The other kinds come from the product brief and
// only give the instruction a shape. The server holds the same list.
export const directionKinds = [
  { id: 'missing_material', label: 'What is missing', hint: 'Material the file should have had and did not.' },
  { id: 'investigation', label: 'Investigation required', hint: 'A step Police are to take.' },
  { id: 'statement', label: 'Additional statement', hint: 'A statement to be taken, and from whom.' },
  { id: 'evidence', label: 'Additional evidence', hint: 'Evidence to be obtained or produced.' },
  { id: 'clarification', label: 'Clarification', hint: 'Something in the file that is unclear or inconsistent.' },
  { id: 'procedural', label: 'Procedural requirement', hint: 'A procedural step that must be complied with.' },
  { id: 'other', label: 'Other direction', hint: 'Any other documented direction.' },
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
  { id: 'met', label: 'Met' },
  { id: 'not_met', label: 'Not met' },
] as const

export function responseLabel(response: string) {
  return response === 'met' ? 'Met' : response === 'not_met' ? 'Not met' : 'Open'
}

/** The directions given in one return: those on the same decision act. The
 * server keeps them on the act's first decision row. */
export function directionsOf(directions: readonly Direction[], decisionIds: readonly string[]) {
  return directions.filter((d) => decisionIds.includes(d.decisionId))
}
