import { api } from '@/lib/api'
import { estateSchema } from './schema'

/** Head Office's view of every facility it knows (`hq.estate.read`). */
export async function getEstate() {
  return estateSchema.parse(await api('GET', '/api/hq/estate'))
}
