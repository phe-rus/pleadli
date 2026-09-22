import * as z from 'zod'

const count = z.object({ key: z.string(), count: z.number() })

export const returnsSchema = z.object({
  from: z.number(),
  to: z.number(),
  sittings: z.object({ total: z.number(), scheduled: z.number(), held: z.number(), adjourned: z.number(), cancelled: z.number() }),
  adjournments: z.number(),
  adjournmentsWithoutDate: z.number(),
  byReason: z.array(count),
  byResponsible: z.array(count),
  mostAdjourned: z.array(z.object({ caseId: z.string(), courtNumber: z.string(), title: z.string(), adjournments: z.number(), status: z.string() })),
  openCases: z.number(),
  concludedInPeriod: z.number(),
  backlog: z.array(count),
  closedSittings: z.number(),
  signedRecords: z.number(),
  deliveredDecisions: z.number(),
  reservedDrafts: z.number(),
  oldestReservedDays: z.number().nullable(),
  notProduced: z.number(),
  recordings: z.number(),
})
export type Returns = z.infer<typeof returnsSchema>

/** The periods offered, in days back from the end of today. */
export const periods = [
  { id: '30', days: 30, label: 'Last 30 days' },
  { id: '90', days: 90, label: 'Last 90 days' },
  { id: '365', days: 365, label: 'Last year' },
] as const
export type PeriodId = (typeof periods)[number]['id']
export const isPeriod = (value: unknown): value is PeriodId => periods.some((p) => p.id === value)
