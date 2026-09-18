import * as z from 'zod'
import { api } from '@/lib/api'
import { searchResultSchema } from './schema'

export async function search(query: string) {
  return z.array(searchResultSchema).parse(await api('GET', '/api/prisons/search', { query: { query } }))
}
