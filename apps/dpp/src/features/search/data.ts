import * as z from 'zod'
import { api } from '@/lib/api'
import { searchResultSchema } from './schema'

/**
 * One aggregated, ranked search across every domain, a thin fan-out over
 * each domain's own search function done in Rust (see domain/search.rs), not
 * a second copy of the same logic here.
 */
export async function search(query: string) {
  return z.array(searchResultSchema).parse(await api('GET', '/api/search', { query: { query } }))
}
