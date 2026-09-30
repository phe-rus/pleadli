import * as z from 'zod'
import { m } from '@/paraglide/messages'

export const numberingResets = [
  { value: 'yearly', get label() { return m.numbering_restart_every_year() } },
  { value: 'never', get label() { return m.numbering_never_restart() } },
] as const

export const numberingTokens = [
  { token: '{SEQ:4}', get meaning() { return m.numbering_running_number_padded_to_4_digits() } },
  { token: '{SEQ}', get meaning() { return m.numbering_running_number_not_padded() } },
  { token: '{YEAR}', get meaning() { return m.numbering_year_of_admission_for_example_2026() } },
  { token: '{YY}', get meaning() { return m.numbering_two_digit_year_for_example_26() } },
  { token: '{MONTH}', get meaning() { return m.numbering_month_of_admission_01_to_12() } },
  { token: '{FAC}', get meaning() { return m.numbering_this_facility_s_number() } },
] as const

export const provisionalNotice = () => m.numbering_provisional_notice()

export const uniformPalette = [
  { value: 'blue', get label() { return m.numbering_blue() }, dot: 'bg-blue-600' },
  { value: 'yellow', get label() { return m.numbering_yellow() }, dot: 'bg-yellow-400' },
  { value: 'maroon', get label() { return m.numbering_maroon() }, dot: 'bg-red-900' },
  { value: 'white', get label() { return m.numbering_white() }, dot: 'bg-white' },
  { value: 'orange', get label() { return m.numbering_orange() }, dot: 'bg-orange-500' },
  { value: 'green', get label() { return m.numbering_green() }, dot: 'bg-green-600' },
  { value: 'grey', get label() { return m.numbering_grey() }, dot: 'bg-gray-400' },
  { value: 'black', get label() { return m.numbering_black() }, dot: 'bg-neutral-900 dark:bg-neutral-950' },
  { value: 'red', get label() { return m.numbering_red() }, dot: 'bg-red-600' },
  { value: 'purple', get label() { return m.numbering_purple() }, dot: 'bg-purple-600' },
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
      return m.prisoners_unconvicted_remand()
    case 'convicted':
      return m.numbering_convicted()
    case 'civil':
      return m.prisoners_civil_debtor()
    default:
      return category
  }
}

export function numberingSourceLabel(source: string | null) {
  switch (source) {
    case 'head_office':
      return m.numbering_head_office_default()
    case 'facility':
      return m.numbering_set_here()
    default:
      return m.numbering_provisional_default()
  }
}

/** The same rules the node enforces, so the preview and the error appear as
 * the pattern is typed. The node still validates on save. */
export function previewPattern(pattern: string, reset: string, facilityNumber: string | null) {
  const text = pattern.trim()
  if (!text) return { examples: [] as string[], error: m.numbering_enter_a_pattern() }
  if (text.length > 40) return { examples: [], error: m.numbering_the_pattern_can_be_at_most() }
  const now = new Date()
  const fac = facilityNumber?.trim() || 'FAC'
  let hasSeq = false
  let hasYear = false
  let error: string | null = null
  const render = (seq: number) =>
    text.replace(/\{([^{}]*)\}|([^A-Za-z0-9/\-._ ])/g, (whole, token: string | undefined, bad: string | undefined) => {
      if (bad) {
        error ??= m.numbering_cannot_be_used_letters_digits_and({ bad })
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
      error ??= m.numbering_is_not_a_known_part({ whole })
      return ''
    })
  const examples = [render(1), render(2)]
  if (/[{}]/.test(examples[0])) error ??= m.numbering_err_unmatched_brace({ open: '{', close: '}' })
  if (!error && !hasSeq) error = m.numbering_err_needs_seq({ seq: '{SEQ}', seqPadded: '{SEQ:4}' })
  if (!error && reset === 'yearly' && !hasYear) error = m.numbering_err_needs_year({ year: '{YEAR}', yy: '{YY}' })
  return { examples: error ? [] : examples, error }
}
