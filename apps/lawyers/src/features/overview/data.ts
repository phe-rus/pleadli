import { api } from '@/lib/api'
import { dayBounds } from '@/lib/day'
import { overviewSchema } from './schema'

/** Today, as the advocate's local day. */
export async function getToday() {
  const { from, to } = dayBounds(Date.now())
  return overviewSchema.parse(await api('GET', '/api/overview', { query: { from, to } }))
}
