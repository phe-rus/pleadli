import * as z from 'zod'
import { api, seg } from '@/lib/api'
import * as m from '@/paraglide/messages'

export const stages = ['receive', 'review', 'decide', 'prepare', 'handover', 'follow_up', 'concluded'] as const
export type Stage = (typeof stages)[number]

export const stageLabel = (s: string) =>
  (
    ({
      receive: m["stage.pipe.receive"],
      review: m["stage.pipe.review"],
      decide: m["stage.pipe.decide"],
      prepare: m["stage.pipe.prepare"],
      handover: m["stage.pipe.handover"],
      follow_up: m["stage.pipe.follow_up"],
      concluded: m["stage.pipe.concluded"],
    }) as Record<string, () => string>
  )[s]?.() ?? s

export const stageAbout = (s: string) =>
  (
    ({
      receive: m["stage.pipe.receive_about"],
      review: m["stage.pipe.review_about"],
      decide: m["stage.pipe.decide_about"],
      prepare: m["stage.pipe.prepare_about"],
      handover: m["stage.pipe.handover_about"],
      follow_up: m["stage.pipe.follow_up_about"],
      concluded: m["stage.pipe.concluded_about"],
    }) as Record<string, () => string>
  )[s]?.() ?? ''

export const proposalSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  stage: z.string(),
  body: z.record(z.string(), z.any()),
  model: z.string(),
  status: z.enum(['proposed', 'accepted', 'edited', 'rejected']),
  responseNote: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.number().nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
})
export type Proposal = z.infer<typeof proposalSchema>

export const boardCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  reference: z.string().nullable(),
  stage: z.enum(stages),
  stageChangedAt: z.number().nullable(),
  receivedAt: z.number(),
  currentStatus: z.string(),
  outcome: z.string().nullable(),
  accused: z.string().nullable(),
  nextHearingAt: z.number().nullable(),
  proposalWaiting: z.boolean(),
  openTasks: z.number(),
})
export type BoardCard = z.infer<typeof boardCardSchema>

export const handoverSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  recipient: z.string(),
  method: z.enum(['connection', 'email', 'print', 'collection', 'download', 'other']),
  note: z.string().nullable(),
  replyDueAt: z.number().nullable(),
  handedBy: z.string().nullable(),
  handedAt: z.number(),
})
export type Handover = z.infer<typeof handoverSchema>

export const getBoard = async () => z.array(boardCardSchema).parse(await api('GET', '/api/cases/board'))
export const setStage = (fileId: string, stage: Stage) => api('PUT', `/api/prosecution-files/${seg(fileId)}/stage`, { body: { stage } })
export const listProposals = async (fileId: string) => z.array(proposalSchema).parse(await api('GET', '/api/proposals', { query: { fileId } }))
export const propose = async (fileId: string, stage: string | null, context: unknown) => proposalSchema.parse(await api('POST', '/api/proposals', { body: { fileId, stage, context } }))
export const answerProposal = async (id: string, answer: 'accept' | 'reject', body?: Record<string, unknown>, note?: string) =>
  z.object({ proposal: proposalSchema, stage: z.string() }).parse(await api('POST', `/api/proposals/${seg(id)}/answer`, { body: { answer, body, note } }))
export const listHandovers = async (fileId: string) => z.array(handoverSchema).parse(await api('GET', '/api/handovers', { query: { fileId } }))
export const recordHandover = async (input: { prosecutionFileId: string; recipient: string; method: Handover['method']; note?: string | null }) =>
  handoverSchema.parse(await api('POST', '/api/handovers', { body: input }))
