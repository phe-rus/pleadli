import { api } from '@/lib/api'
import { dayBounds } from '@/lib/day'
import { overviewSchema } from './schema'

export async function getOverview(from: number, to: number) {
  return overviewSchema.parse(await api('GET', '/api/overview', { query: { from, to } }))
}

/** Today, as the court's local day. */
export const getToday = () => {
  const { from, to } = dayBounds(Date.now())
  return getOverview(from, to)
}
