/** The counting rule behind every strict quota: a fixed window that starts at the first request
 * and ends `windowMs` later. Pure and synchronous, so inside a Durable Object (one thread per
 * object, no interleaving between read and write) it is an atomic counter, and in a test it can be
 * driven with any clock. Nothing here knows about Cloudflare. */

export type WindowState = { start: number; count: number }
export type Verdict = { ok: true; remaining: number } | { ok: false; retryAfter: number }

export function hitWindow(state: WindowState | undefined, limit: number, windowMs: number, now: number): { state: WindowState; verdict: Verdict } {
  if (!state || now - state.start >= windowMs) {
    const fresh = { start: now, count: 1 }
    return { state: fresh, verdict: limit >= 1 ? { ok: true, remaining: limit - 1 } : { ok: false, retryAfter: Math.ceil(windowMs / 1000) } }
  }
  // A refused request does not extend the window, so waiting always ends the refusal.
  if (state.count >= limit) return { state, verdict: { ok: false, retryAfter: Math.max(1, Math.ceil((state.start + windowMs - now) / 1000)) } }
  const next = { start: state.start, count: state.count + 1 }
  return { state: next, verdict: { ok: true, remaining: limit - next.count } }
}
