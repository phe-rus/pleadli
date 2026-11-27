import { api, seg } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as z from 'zod'

export const adjournmentCauses = ['prosecution', 'defence', 'court', 'other'] as const
export type AdjournmentCause = (typeof adjournmentCauses)[number]

export const witnessSchema = z.object({ witness: z.string(), served: z.boolean(), reason: z.string().nullable() })
export type Witness = z.infer<typeof witnessSchema>

export const minuteSchema = z.object({
  hearingId: z.string(),
  nextDate: z.number().nullable(),
  adjournmentCause: z.string().nullable(),
  exhibits: z.array(z.string()),
  note: z.string().nullable(),
  sentAt: z.number().nullable(),
  updatedAt: z.number(),
  witnesses: z.array(witnessSchema),
})
export type Minute = z.infer<typeof minuteSchema>

export type MinuteInput = { nextDate: number | null; adjournmentCause: string | null; exhibits: string[]; note: string | null; witnesses: Witness[] }

export const listMinutes = async (fileId: string) => z.array(minuteSchema).parse(await api('GET', '/api/hearings/minutes', { query: { fileId } }))
export const saveMinute = async (hearingId: string, input: MinuteInput) => minuteSchema.parse(await api('PUT', `/api/hearings/${seg(hearingId)}/minute`, { body: input }))

export const minutesKey = (fileId: string) => ['hearing-minutes', fileId] as const
export const useMinutes = (fileId: string) => useQuery({ queryKey: minutesKey(fileId), queryFn: () => listMinutes(fileId) })

export function useSaveMinute(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ hearingId, input }: { hearingId: string; input: MinuteInput }) => saveMinute(hearingId, input),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: minutesKey(fileId) }), qc.invalidateQueries({ queryKey: ['clocks'] })]),
  })
}

export const sendMinute = async (hearingId: string) => api('POST', `/api/hearings/${seg(hearingId)}/minute/send`)

/** Prepares the minute for the station that holds the police file. It then waits in the Postbox. */
export function useSendMinute(fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (hearingId: string) => sendMinute(hearingId),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: minutesKey(fileId) }), qc.invalidateQueries({ queryKey: ['interchange', 'outgoing'] })]),
  })
}
