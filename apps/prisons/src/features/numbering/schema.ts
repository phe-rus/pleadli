import * as z from 'zod'

export const numberingResets = [
  { value: 'yearly', label: 'Restart every year' },
  { value: 'never', label: 'Never restart' },
] as const

export const numberingTokens = [
  { token: '{SEQ:4}', meaning: 'Running number, padded to 4 digits' },
  { token: '{SEQ}', meaning: 'Running number, not padded' },
  { token: '{YEAR}', meaning: 'Year of admission, for example 2026' },
  { token: '{YY}', meaning: 'Two-digit year, for example 26' },
  { token: '{MONTH}', meaning: 'Month of admission, 01 to 12' },
  { token: '{FAC}', meaning: 'This facility’s number' },
] as const

export const provisionalNotice =
  'Provisional default. No official Uganda Prisons Service numbering format could be found in public sources. Set your Service’s own.'

export const uniformPalette = [
  { value: 'blue', label: 'Blue', dot: 'bg-blue-600' },
  { value: 'yellow', label: 'Yellow', dot: 'bg-yellow-400' },
  { value: 'maroon', label: 'Maroon', dot: 'bg-red-900' },
  { value: 'white', label: 'White', dot: 'bg-white' },
  { value: 'orange', label: 'Orange', dot: 'bg-orange-500' },
  { value: 'green', label: 'Green', dot: 'bg-green-600' },
  { value: 'grey', label: 'Grey', dot: 'bg-gray-400' },
  { value: 'black', label: 'Black', dot: 'bg-neutral-900 dark:bg-neutral-950' },
  { value: 'red', label: 'Red', dot: 'bg-red-600' },
  { value: 'purple', label: 'Purple', dot: 'bg-purple-600' },
] as const

export function uniformColour(value: string | null | undefined) {
  return uniformPalette.find((c) => c.value === value) ?? null
}

export const uniformSchema = z.object({
  category: z.string(),
  colour: z.string().nullable(),
  label: z.string().nullable(),
  source: z.string().nullable().optional(),
})

export type UniformEntry = z.infer<typeof uniformSchema>

export const numberingConfigSchema = z.object({
  pattern: z.string(),
  reset: z.string(),
  source: z.string(),
  updatedAt: z.number().nullable(),
  updatedBy: z.string().nullable(),
})

export const numberingViewSchema = z.object({
  config: numberingConfigSchema,
  preview: z.array(z.string()),
  locked: z.boolean(),
  admittedCount: z.number(),
  facilityNumber: z.string().nullable(),
  uniforms: z.array(uniformSchema),
})

export type NumberingView = z.infer<typeof numberingViewSchema>

export const estatePolicySchema = z.object({
  pattern: z.string(),
  reset: z.string(),
  preview: z.array(z.string()),
  uniforms: z.array(uniformSchema),
  updatedAt: z.number().nullable(),
  updatedBy: z.string().nullable(),
  facilities: z.array(
    z.object({
      facilityId: z.string(),
      name: z.string(),
      status: z.string(),
      pattern: z.string().nullable(),
      source: z.string().nullable(),
      locked: z.boolean().nullable(),
      reportedAt: z.number().nullable(),
    }),
  ),
})

export type EstatePolicy = z.infer<typeof estatePolicySchema>

export const policyPullResultSchema = z.object({
  numberingApplied: z.boolean(),
  numberingKeptReason: z.string().nullable(),
  uniformsApplied: z.number(),
})

export type NumberingInput = { pattern: string; reset: string }
export type UniformInput = { category: string; colour: string | null; label: string | null }

export function uniformCategoryLabel(category: string) {
  switch (category) {
    case 'unconvicted':
      return 'Unconvicted (remand)'
    case 'convicted':
      return 'Convicted'
    case 'civil':
      return 'Civil (debtor)'
    default:
      return category
  }
}

export function numberingSourceLabel(source: string | null) {
  switch (source) {
    case 'head_office':
      return 'Head Office default'
    case 'facility':
      return 'Set here'
    default:
      return 'Provisional default'
  }
}

/** The same rules the node enforces, so the preview and the error appear as
 * the pattern is typed. The node still validates on save. */
export function previewPattern(pattern: string, reset: string, facilityNumber: string | null) {
  const text = pattern.trim()
  if (!text) return { examples: [] as string[], error: 'Enter a pattern.' }
  if (text.length > 40) return { examples: [], error: 'The pattern can be at most 40 characters.' }
  const now = new Date()
  const fac = facilityNumber?.trim() || 'FAC'
  let hasSeq = false
  let hasYear = false
  let error: string | null = null
  const render = (seq: number) =>
    text.replace(/\{([^{}]*)\}|([^A-Za-z0-9/\-._ ])/g, (whole, token: string | undefined, bad: string | undefined) => {
      if (bad) {
        error ??= `"${bad}" cannot be used. Letters, digits, / - . _ and spaces only.`
        return ''
      }
      const name = token ?? ''
      const padded = /^SEQ:([1-9])$/.exec(name)
      if (name === 'SEQ') {
        hasSeq = true
        return String(seq)
      }
      if (padded) {
        hasSeq = true
        return String(seq).padStart(Number(padded[1]), '0')
      }
      if (name === 'YEAR') {
        hasYear = true
        return String(now.getFullYear())
      }
      if (name === 'YY') {
        hasYear = true
        return String(now.getFullYear() % 100).padStart(2, '0')
      }
      if (name === 'MONTH') return String(now.getMonth() + 1).padStart(2, '0')
      if (name === 'FAC') return fac
      error ??= `${whole} is not a known part.`
      return ''
    })
  const examples = [render(1), render(2)]
  if (/[{}]/.test(examples[0])) error ??= 'A { or } in the pattern is not matched.'
  if (!error && !hasSeq) error = 'The pattern needs a {SEQ} or {SEQ:4} part, or every person would get the same number.'
  if (!error && reset === 'yearly' && !hasYear) error = 'A counter that restarts every year needs {YEAR} or {YY} in the pattern.'
  return { examples: error ? [] : examples, error }
}
