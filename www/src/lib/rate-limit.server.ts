/** The isolate-local counter. It is NOT a rate limit you can rely on: every Worker isolate has its own
 * memory, so a client whose requests land on different isolates is counted separately in each. It exists
 * only as the degraded fallback of `quota.server.ts` when the Durable Object cannot be reached.
 * Real limits: the Durable Object counter, the Rate Limiting binding and the dashboard WAF rule
 * (docs/platform/PUBLIC-AND-FIELD-API.md, "Limits"). */

const MAX_KEYS = 5_000
const hits = new Map<string, { start: number; count: number }>()

export function limitLookups(key: string, now: number, limit: number, windowMs: number): { ok: true } | { ok: false; retryAfter: number } {
  const entry = hits.get(key)
  if (!entry || now - entry.start >= windowMs) {
    if (hits.size >= MAX_KEYS) {
      for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k)
      if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value!)
    }
    hits.set(key, { start: now, count: 1 })
    return { ok: true }
  }
  entry.count += 1
  if (entry.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000)) }
  return { ok: true }
}

export function resetLimiter() {
  hits.clear()
}
