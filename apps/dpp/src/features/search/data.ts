import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { searchResultSchema } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47921'

async function devFetch(path: string) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

/**
 * One aggregated, ranked search across every domain — a thin fan-out over
 * each domain's own already-existing search function, done in Rust
 * (see domain/search.rs), not a second copy of the same logic here.
 */
export async function search(query: string) {
  const results = isTauri()
    ? await invoke('search', { query })
    : await devFetch(`/search?query=${encodeURIComponent(query)}`)
  return z.array(searchResultSchema).parse(results)
}
