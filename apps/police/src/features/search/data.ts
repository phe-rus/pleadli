import { api } from '@/lib/api'
import * as z from 'zod'
import { searchResultSchema } from './schema'

// Only reachable in a dev build (see src-tauri/src/server.rs) — lets the
// plain browser dev server (no Tauri IPC bridge) exercise the same data
// layer against the real local database during development.
/**
 * One aggregated, ranked search across every domain — a thin fan-out over
 * each domain's own already-existing `list*(query)` function, done in Rust
 * (see domain/search.rs), not a second copy of the same logic here.
 */
export async function search(query: string) {
  const results = await api(`/search?query=${encodeURIComponent(query)}`)
  return z.array(searchResultSchema).parse(results)
}
