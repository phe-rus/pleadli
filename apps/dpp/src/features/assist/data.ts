import * as z from 'zod'
import { api } from '@/lib/api'
import { fileItemSchema } from '@/features/file-index/data'

export const assistSettingsSchema = z.object({
  mode: z.enum(['off', 'institution_key']),
  provider: z.enum(['gemini', 'openrouter', 'anthropic', 'openai_compatible']),
  model: z.string(),
  autoModel: z.boolean(),
  baseUrl: z.string().nullable(),
  keySource: z.enum(['settings', 'environment']).nullable(),
  keyHint: z.string().nullable(),
  lawsTokenSet: z.boolean(),
  acknowledgedBy: z.string().nullable(),
  acknowledgedAt: z.number().nullable(),
  ready: z.boolean(),
})
export type AssistSettings = z.infer<typeof assistSettingsSchema>
export type Provider = AssistSettings['provider']

export const modelInfoSchema = z.object({ id: z.string(), label: z.string(), rank: z.number().nullable() })
export type ModelInfo = z.infer<typeof modelInfoSchema>
export const listModels = async () => z.array(modelInfoSchema).parse(await api('GET', '/api/assist/models'))

export const lawSchema = z.object({
  id: z.string(),
  jurisdiction: z.string(),
  title: z.string(),
  cite: z.string().nullable(),
  frbrUri: z.string().nullable(),
  source: z.string(),
  asAt: z.string().nullable(),
  characters: z.number(),
  fetchedAt: z.number(),
})
export type Law = z.infer<typeof lawSchema>
export const listLaws = async (jurisdiction: string) => z.array(lawSchema).parse(await api('GET', '/api/laws', { query: { jurisdiction } }))
export const syncLaws = async (jurisdiction: string, titles: string[]) =>
  z.object({ updated: z.array(z.string()), notFound: z.array(z.string()) }).parse(await api('POST', '/api/laws/sync', { body: { jurisdiction, titles } }))
export const addLaw = (law: { jurisdiction: string; title: string; cite: string | null; asAt: string | null; body: string }) => api('POST', '/api/laws', { body: law })
export const deleteLaw = (id: string) => api('DELETE', `/api/laws/${encodeURIComponent(id)}`)

const option = z.object({ kind: z.string(), for: z.string(), against: z.string(), recommended: z.boolean() })
export const briefBodySchema = z.object({
  summary: z.string(),
  people: z.array(z.object({ name: z.string(), role: z.string(), says: z.string() })),
  contradictions: z.array(z.string()),
  missing: z.array(z.string()),
  offences: z.array(z.object({ offence: z.string(), statute: z.string(), why: z.string() })),
  options: z.array(option),
  nextSteps: z.array(z.object({ title: z.string(), why: z.string(), who: z.string() })),
})
export type BriefBody = z.infer<typeof briefBodySchema>

export const briefSchema = z.object({
  id: z.string(),
  model: z.string(),
  createdAt: z.number(),
  requestedBy: z.string().nullable(),
  brief: briefBodySchema,
})
export type Brief = z.infer<typeof briefSchema>

export const foundPersonSchema = z.object({ firstName: z.string(), lastName: z.string(), role: z.enum(['accused', 'complainant', 'witness']) })
export const foundChargeSchema = z.object({ offence: z.string(), section: z.string(), particulars: z.string(), accused: z.string() })
export type FoundPerson = z.infer<typeof foundPersonSchema>
export const foundCustodySchema = z.object({
  kind: z.enum(['arrest', 'court_production', 'remand', 'remand_both', 'remand_high_court', 'map', 'odp', 'odp_extension', 'bail', 'release', 'trial_start']),
  at: z.string(),
  person: z.string(),
})
export type FoundCustody = z.infer<typeof foundCustodySchema>
export type FoundCharge = z.infer<typeof foundChargeSchema>

export const arrangedSchema = z.object({
  fileTitle: z.string(),
  policeReference: z.string(),
  people: z.array(foundPersonSchema).catch([]),
  custody: z.array(foundCustodySchema).catch([]),
  charges: z.array(foundChargeSchema).catch([]),
  items: z.array(fileItemSchema),
})
export type Arranged = z.infer<typeof arrangedSchema>

export type CountryContext = { code: string; institution: string; country: string; language: string; laws: string[]; decisions: string[]; fileSections: string[]; timeLimits: string[]; courts: string[]; clocks: string[] }

export const getAssistSettings = async () => assistSettingsSchema.parse(await api('GET', '/api/assist/settings'))
export type AssistSettingsChange = {
  mode: 'off' | 'institution_key'
  provider?: Provider
  model?: string
  autoModel?: boolean
  baseUrl?: string
  apiKey?: string
  lawsToken?: string
  acknowledge?: boolean
}
export const saveAssistSettings = async (change: AssistSettingsChange) => assistSettingsSchema.parse(await api('PUT', '/api/assist/settings', { body: change }))
export const getLatestBrief = async (fileId: string) => briefSchema.nullable().parse(await api('GET', '/api/assist/brief', { query: { fileId } }))
export const requestBrief = async (fileId: string, context: CountryContext) => briefSchema.parse(await api('POST', '/api/assist/brief', { body: { fileId, context } }))
export const arrangeScans = async (fileId: string, attachmentIds: string[], context: CountryContext) =>
  arrangedSchema.parse(await api('POST', '/api/assist/arrange', { body: { fileId, attachmentIds, context } }))
