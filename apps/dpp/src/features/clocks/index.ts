import { api } from '@/lib/api'
import { queryOptions, useQuery } from '@tanstack/react-query'
import * as z from 'zod'

export const clockSchema = z.object({
  fileId: z.string(),
  fileTitle: z.string(),
  kind: z.enum(['allocation', 'complaint_reply', 'adjournment_review']),
  dueAt: z.number().nullable(),
  overdue: z.boolean(),
  count: z.number().nullable(),
})
export type OfficeClock = z.infer<typeof clockSchema>

export const clocksOptions = () => queryOptions({ queryKey: ['clocks'] as const, queryFn: async () => z.array(clockSchema).parse(await api('GET', '/api/clocks')), refetchInterval: 60_000 })
export const useClocks = () => useQuery(clocksOptions())
