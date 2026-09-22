import { api } from '@/lib/api'
import { DAY_MS, startOfDay } from '@/lib/day'
import { returnsSchema } from './schema'

/** Figures for the `days` up to and including today, on the court's local days. */
export async function getReturns(days: number) {
  const to = startOfDay(Date.now()) + DAY_MS
  const from = to - days * DAY_MS
  return returnsSchema.parse(await api('GET', '/api/reports/returns', { query: { from, to } }))
}
