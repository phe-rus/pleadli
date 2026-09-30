import { api } from '@/lib/api'
import { queryOptions } from '@tanstack/react-query'
import * as z from 'zod'

const keyCount = z.object({ key: z.string(), count: z.number() })
export type KeyCount = z.infer<typeof keyCount>

export const statisticsSchema = z.object({
  year: z.number(),
  years: z.array(z.number()),
  byType: z.array(z.object({ matterType: z.string(), open: z.number(), opened: z.number(), closed: z.number() })),
  openByStage: z.array(z.object({ matterType: z.string(), stage: z.string(), count: z.number() })),
  openedByEngagement: z.array(keyCount),
  openedByMonth: z.array(z.number()),
  hearingsByStatus: z.array(keyCount),
  adjournmentsByCause: z.array(keyCount),
  clocks: z.object({ overdue: z.number(), soon: z.number(), running: z.number() }),
  money: z.object({ billed: z.number(), collected: z.number(), disbursed: z.number(), heldForClients: z.number() }),
  minutesRecorded: z.number(),
  proBonoMinutes: z.number(),
  registerByKind: z.array(keyCount),
})
export type Statistics = z.infer<typeof statisticsSchema>

export const statisticsOptions = (year?: number) =>
  queryOptions({ queryKey: ['statistics', year ?? 'now'] as const, queryFn: async () => statisticsSchema.parse(await api('GET', '/api/statistics', { query: year ? { year: String(year) } : {} })) })
