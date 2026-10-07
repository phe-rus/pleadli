import { api, seg } from '@/lib/api'
import * as z from 'zod'

export type Provider = 'gemini' | 'openrouter' | 'anthropic' | 'openai_compatible'

export const assistSettingsSchema = z.object({
  mode: z.enum(['off', 'practice_key']),
  provider: z.enum(['gemini', 'openrouter', 'anthropic', 'openai_compatible']),
  model: z.string(),
  autoModel: z.boolean(),
  baseUrl: z.string().nullable(),
  keySource: z.enum(['settings', 'environment']).nullable(),
  keyHint: z.string().nullable(),
  acknowledgedBy: z.string().nullable(),
  acknowledgedAt: z.number().nullable(),
  ready: z.boolean(),
})
export type AssistSettings = z.infer<typeof assistSettingsSchema>

export type AssistSettingsChange = {
  mode: 'off' | 'practice_key'
  provider?: Provider
  model?: string
  autoModel?: boolean
  baseUrl?: string
  /** A new key; '' removes it. */
  apiKey?: string
  acknowledge?: boolean
}

const modelSchema = z.object({ id: z.string(), label: z.string(), rank: z.number().nullable(), free: z.boolean() })
export type ModelInfo = z.infer<typeof modelSchema>

export const getAssistSettings = async () => assistSettingsSchema.parse(await api('GET', '/api/assist/settings'))
export const saveAssistSettings = async (change: AssistSettingsChange) => assistSettingsSchema.parse(await api('PUT', '/api/assist/settings', { body: change }))
export const listModels = async () => z.array(modelSchema).parse(await api('GET', '/api/assist/models'))

export const TASKS = ['summary', 'chronology', 'summarise_document', 'unanswered', 'draft', 'explain_clock', 'chat'] as const
export type AssistTask = (typeof TASKS)[number]

export type AskInput = {
  task: AssistTask
  documentId?: string
  text?: string
  draftKind?: string
  rule?: string
  messages?: { role: 'user' | 'assistant'; content: string }[]
  language?: string
  /** A model chosen in the chat; none means Automatic. */
  model?: string
}

const pointSchema = z.object({ date: z.string().nullish(), text: z.string(), source: z.string().nullish() })
export const answerSchema = z.object({
  task: z.string(),
  text: z.string().nullable(),
  points: z.array(pointSchema),
  draft: z.object({ title: z.string(), paragraphs: z.array(z.string()) }).nullable(),
  model: z.string(),
})
export type AssistAnswer = z.infer<typeof answerSchema>

export const askAssist = async (matterId: string, input: AskInput) => answerSchema.parse(await api('POST', `/api/matters/${seg(matterId)}/assist`, { body: input }))
