import * as z from 'zod'
import { api, seg } from '@/lib/api'

export const hearingKinds = ['mention', 'plea', 'bail', 'hearing', 'trial', 'ruling', 'judgment', 'sentence', 'other'] as const
export type HearingKind = (typeof hearingKinds)[number]

export const hearingSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  court: z.string(),
  kind: z.enum(hearingKinds),
  startsAt: z.number(),
  outcome: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
})
export type Hearing = z.infer<typeof hearingSchema>

export const filingSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  what: z.string(),
  court: z.string(),
  filedAt: z.number(),
  receipt: z.string().nullable(),
  documentId: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
})
export type Filing = z.infer<typeof filingSchema>

export const calendarEntrySchema = z.object({
  source: z.enum(['hearing', 'task', 'threshold_review']),
  id: z.string(),
  at: z.number(),
  kind: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  fileId: z.string().nullable(),
  fileTitle: z.string().nullable(),
  fileReference: z.string().nullable(),
})
export type CalendarEntry = z.infer<typeof calendarEntrySchema>

export type HearingInput = { prosecutionFileId: string; court: string; kind: HearingKind; startsAt: number; outcome?: string | null; note?: string | null }
export type FilingInput = { prosecutionFileId: string; what: string; court: string; filedAt: number; receipt?: string | null; note?: string | null }

export const listHearings = async (fileId: string) => z.array(hearingSchema).parse(await api('GET', '/api/hearings', { query: { fileId } }))
export const createHearing = async (input: HearingInput) => hearingSchema.parse(await api('POST', '/api/hearings', { body: input }))
export const updateHearing = async (id: string, input: HearingInput) => hearingSchema.parse(await api('PUT', `/api/hearings/${seg(id)}`, { body: input }))
export const deleteHearing = (id: string) => api('DELETE', `/api/hearings/${seg(id)}`)
export const listFilings = async (fileId: string) => z.array(filingSchema).parse(await api('GET', '/api/filings', { query: { fileId } }))
export const createFiling = async (input: FilingInput) => filingSchema.parse(await api('POST', '/api/filings', { body: input }))
export const deleteFiling = (id: string) => api('DELETE', `/api/filings/${seg(id)}`)
export const getCalendar = async (from: number, to: number) => z.array(calendarEntrySchema).parse(await api('GET', '/api/calendar', { query: { from, to } }))
