import { api } from '@/lib/api'
import { legalOverviewSchema } from './schema'

export async function getLegalOverview() {
  return legalOverviewSchema.parse(await api('GET', '/api/prisons/legal'))
}
