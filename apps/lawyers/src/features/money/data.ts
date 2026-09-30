import { api, seg } from '@/lib/api'
import { queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import * as z from 'zod'

/** Whole shillings, as the practice writes them. */
export const ugx = (amount: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 }).format(amount)

export const entryKinds = ['received', 'paid_out', 'to_office', 'fee_received', 'disbursement'] as const
export type EntryKind = (typeof entryKinds)[number]

export const ledgerEntrySchema = z.object({
  id: z.string(),
  clientId: z.string(),
  matterId: z.string().nullable(),
  account: z.enum(['client', 'office']),
  kind: z.enum(entryKinds),
  amount: z.number(),
  onDay: z.number(),
  reference: z.string().nullable(),
  description: z.string(),
  feeNoteId: z.string().nullable(),
  feeNoteNumber: z.string().nullable(),
  reverses: z.string().nullable(),
  reversed: z.boolean(),
  recordedBy: z.string().nullable(),
  createdAt: z.number(),
  matterTitle: z.string().nullable(),
})
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>

export const clientMoneySchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  clientBalance: z.number(),
  disbursementsUnbilled: z.number(),
  owed: z.number(),
  entries: z.array(ledgerEntrySchema),
})
export type ClientMoney = z.infer<typeof clientMoneySchema>

const positionSchema = z.object({ clientId: z.string(), clientName: z.string(), clientBalance: z.number(), owed: z.number() })
export type ClientPosition = z.infer<typeof positionSchema>

export const feeNoteSummarySchema = z.object({
  id: z.string(),
  number: z.string().nullable(),
  matterId: z.string(),
  clientId: z.string(),
  status: z.enum(['draft', 'issued', 'cancelled']),
  issuedOn: z.number().nullable(),
  dueOn: z.number().nullable(),
  note: z.string().nullable(),
  issuedBy: z.string().nullable(),
  cancelledReason: z.string().nullable(),
  createdAt: z.number(),
  matterTitle: z.string(),
  courtNumber: z.string().nullable(),
  clientName: z.string(),
  total: z.number(),
  paid: z.number(),
})
export type FeeNoteSummary = z.infer<typeof feeNoteSummarySchema>

const lineSchema = z.object({
  id: z.string(),
  position: z.number(),
  kind: z.enum(['fee', 'time', 'disbursement']),
  description: z.string(),
  amount: z.number(),
  timeEntryId: z.string().nullable(),
  minutes: z.number().nullable(),
  rate: z.number().nullable(),
})
export const feeNoteSchema = feeNoteSummarySchema.extend({ lines: z.array(lineSchema) })
export type FeeNote = z.infer<typeof feeNoteSchema>

const timeSchema = z.object({ id: z.string(), matterId: z.string(), workedOn: z.number(), minutes: z.number(), description: z.string() })
export type UnbilledTime = z.infer<typeof timeSchema>

export type EntryInput = { clientId: string; matterId: string | null; kind: EntryKind; amount: number; onDay: number; reference: string | null; description: string; feeNoteId: string | null }
export type FeeNoteInput = { matterId: string; timeEntryIds: string[]; rate: number | null; lines: { kind: 'fee' | 'disbursement'; description: string; amount: number }[]; note: string | null }

export const positionsOptions = () => queryOptions({ queryKey: ['money', 'positions'] as const, queryFn: async () => z.array(positionSchema).parse(await api('GET', '/api/money/positions')) })
export const clientMoneyOptions = (clientId: string) =>
  queryOptions({ queryKey: ['money', 'client', clientId] as const, queryFn: async () => clientMoneySchema.parse(await api('GET', `/api/clients/${seg(clientId)}/money`)) })
export const feeNotesOptions = (filter: { matterId?: string; clientId?: string } = {}) =>
  queryOptions({ queryKey: ['fee-notes', filter] as const, queryFn: async () => z.array(feeNoteSummarySchema).parse(await api('GET', '/api/fee-notes', { query: filter })) })
export const feeNoteOptions = (id: string) => queryOptions({ queryKey: ['fee-note', id] as const, queryFn: async () => feeNoteSchema.parse(await api('GET', `/api/fee-notes/${seg(id)}`)) })
export const unbilledTimeOptions = (matterId: string) =>
  queryOptions({ queryKey: ['unbilled-time', matterId] as const, queryFn: async () => z.array(timeSchema).parse(await api('GET', `/api/matters/${seg(matterId)}/unbilled-time`)) })

export const useClientMoney = (clientId: string | null) => useQuery({ ...clientMoneyOptions(clientId ?? ''), enabled: Boolean(clientId) })
export const useRecordEntry = () => useMutation({ mutationFn: async (input: EntryInput) => ledgerEntrySchema.parse(await api('POST', '/api/ledger', { body: input })) })
export const useReverseEntry = () => useMutation({ mutationFn: async (v: { id: string; reason: string }) => ledgerEntrySchema.parse(await api('POST', `/api/ledger/${seg(v.id)}/reverse`, { body: { reason: v.reason } })) })
export const useCreateFeeNote = () => useMutation({ mutationFn: async (input: FeeNoteInput) => feeNoteSchema.parse(await api('POST', '/api/fee-notes', { body: input })) })
export const useUpdateFeeNote = () => useMutation({ mutationFn: async (v: { id: string; input: FeeNoteInput }) => feeNoteSchema.parse(await api('PUT', `/api/fee-notes/${seg(v.id)}`, { body: v.input })) })
export const useDeleteFeeNote = () => useMutation({ mutationFn: (id: string) => api('DELETE', `/api/fee-notes/${seg(id)}`) })
export const useIssueFeeNote = () =>
  useMutation({ mutationFn: async (v: { id: string; issuedOn: number; dueOn: number | null }) => feeNoteSchema.parse(await api('POST', `/api/fee-notes/${seg(v.id)}/issue`, { body: { issuedOn: v.issuedOn, dueOn: v.dueOn } })) })
export const useCancelFeeNote = () => useMutation({ mutationFn: async (v: { id: string; reason: string }) => feeNoteSchema.parse(await api('POST', `/api/fee-notes/${seg(v.id)}/cancel`, { body: { reason: v.reason } })) })
export const useSetHourlyRate = () => useMutation({ mutationFn: (rate: number | null) => api('PUT', '/api/installation/hourly-rate', { body: { rate } }) })

/** Shillings typed with or without separators; null when there is no number. */
export function parseShillings(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '')
  return digits ? Number(digits) : null
}
