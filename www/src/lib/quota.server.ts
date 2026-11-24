import { env } from 'cloudflare:workers'
import { limitLookups } from './rate-limit.server'

/** Quotas for the public lookups and for authenticated record lookups.
 *
 * Three layers, each honest about what it is (docs/platform/PUBLIC-AND-FIELD-API.md, "Limits"):
 *  1. The Cloudflare Workers Rate Limiting binding (`PUBLIC_LOOKUP`): cheap, shared across isolates
 *     in one Cloudflare location, but approximate and location scoped. It sheds load early.
 *  2. A Durable Object counter (`QUOTA`): one authoritative atomic counter per bucket, worldwide.
 *     This is the quota that is actually enforced.
 *  3. An isolate-local counter: a degraded fallback for ONE class of call only, the anonymous public lookups
 *     (verify, track), which answer "is this paper genuine" and "which stage", nothing protected. If the Durable Object
 *     cannot be reached they fall back to this weak limit rather than going dark.
 *
 * Roles, and what happens when the authoritative counter cannot be reached:
 *  - anonymous public lookups (`limitAnonymous`): DEGRADE to the isolate-local counter. Permitted because nothing
 *    protected is behind them. Documented in PUBLIC-AND-FIELD-API.md.
 *  - protected record lookups, credential operations and grant management (`limitAuthenticated`, `limitOfficer`):
 *    FAIL CLOSED. The call is refused with 503 and Retry-After, and nothing is read or changed. An isolate-local count
 *    is never a substitute, because an attacker who can spread requests over isolates (or make the counter unreachable)
 *    would get an unlimited, unaudited path to protected data.
 *
 * A bucket is chosen by the server from facts it verified (the connecting address Cloudflare reports,
 * or the credential, institution and user a grant proves). A caller's own claims (a header, a query
 * parameter, a body field) never name a bucket. Offline casework does not pass through here at all. */

export const ANONYMOUS = { perMinuteEdge: 30, perHour: 300, windowMs: 3_600_000 }
export const AUTHENTICATED = {
  user: { limit: 120, windowMs: 60_000 },
  credential: { limit: 600, windowMs: 60_000 },
  institution: { limit: 3_000, windowMs: 60_000 },
}

/** `unavailable`: the authoritative counter could not be reached, so the call is refused (fail closed), not counted as too many. */
export type Quota = { ok: true } | { ok: false; retryAfter: number; scope: string; unavailable?: true }

type Counter = { hit(limit: number, windowMs: number): Promise<{ ok: true; remaining: number } | { ok: false; retryAfter: number }> }
type Namespace = { idFromName(name: string): unknown; get(id: unknown): Counter }

const e = env as unknown as { QUOTA?: Namespace; PUBLIC_LOOKUP?: { limit(o: { key: string }): Promise<{ success: boolean }> } }

async function digest(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
  return [...bytes.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type Verdict = { ok: true } | { ok: false; retryAfter: number; unavailable?: true }

/** The authoritative count. `degrade` says what an unreachable counter means: true only for the anonymous public lookups. */
async function strict(bucket: string, limit: number, windowMs: number, degrade: boolean): Promise<Verdict> {
  try {
    if (!e.QUOTA) throw new Error('no QUOTA binding')
    const verdict = await e.QUOTA.get(e.QUOTA.idFromName(bucket)).hit(limit, windowMs)
    return verdict.ok ? { ok: true } : { ok: false, retryAfter: verdict.retryAfter }
  } catch (error) {
    if (!degrade) {
      console.error('quota: the authoritative counter is unreachable, refusing a protected call', String(error))
      return { ok: false, retryAfter: UNAVAILABLE_RETRY_SECONDS, unavailable: true }
    }
    console.warn('quota: Durable Object unavailable, using the isolate-local limit for a public lookup', String(error))
    const local = limitLookups(bucket, Date.now(), limit, windowMs)
    return local.ok ? { ok: true } : { ok: false, retryAfter: local.retryAfter }
  }
}

const UNAVAILABLE_RETRY_SECONDS = 5

/** The address Cloudflare saw connecting. Never X-Forwarded-For or any other header a caller can set. */
export function connectingAddress(request: Request) {
  return request.headers.get('cf-connecting-ip') ?? 'unknown'
}

/** Anonymous public lookups (verify, track): by connecting address, hashed so no address is stored. */
export async function limitAnonymous(request: Request): Promise<Quota> {
  const who = await digest(connectingAddress(request))
  if (e.PUBLIC_LOOKUP) {
    try {
      const edge = await e.PUBLIC_LOOKUP.limit({ key: `pub:${who}` })
      if (!edge.success) return { ok: false, retryAfter: 60, scope: 'edge' } // the binding gives no reset time: say the whole period
    } catch (error) {
      console.warn('quota: rate limit binding failed', String(error))
    }
  }
  const verdict = await strict(`anon:${who}`, ANONYMOUS.perHour, ANONYMOUS.windowMs, true)
  return verdict.ok ? { ok: true } : { ok: false, retryAfter: verdict.retryAfter, scope: 'anonymous' }
}

/** What a grant has proved. Built by the authenticator from the stored credential, never from the request. */
export type VerifiedCaller = { credentialId: string; organizationId: string; userId?: string }

/** Authenticated record lookups: per user (when the grant names one), per credential, per institution.
 * Call it AFTER the credential is verified and BEFORE the record is read or authorisation is decided, so
 * a refused caller learns nothing and an unauthenticated caller cannot spend anyone's quota. */
export async function limitAuthenticated(who: VerifiedCaller): Promise<Quota> {
  const tiers: [string, string, { limit: number; windowMs: number }][] = []
  if (who.userId) tiers.push(['user', `user:${who.credentialId}:${who.userId}`, AUTHENTICATED.user])
  tiers.push(['credential', `cred:${who.credentialId}`, AUTHENTICATED.credential], ['institution', `inst:${who.organizationId}`, AUTHENTICATED.institution])
  for (const [scope, bucket, rule] of tiers) {
    const verdict = await strict(bucket, rule.limit, rule.windowMs, false)
    if (!verdict.ok) return { ok: false, retryAfter: verdict.retryAfter, scope, ...(verdict.unavailable ? { unavailable: true as const } : {}) }
  }
  return { ok: true }
}

export const OFFICER = { officer: { limit: 60, windowMs: 60_000 }, institution: { limit: 300, windowMs: 60_000 } }

/** Credential operations and grant management by an officer: per officer and per institution, authoritative, fail closed.
 * Called after the officer is verified and before anything is changed. */
export async function limitOfficer(who: { organizationId: string; officerId: string }): Promise<Quota> {
  for (const [scope, bucket, rule] of [
    ['officer', `officer:${who.officerId}`, OFFICER.officer],
    ['institution-admin', `admin:${who.organizationId}`, OFFICER.institution],
  ] as const) {
    const verdict = await strict(bucket, rule.limit, rule.windowMs, false)
    if (!verdict.ok) return { ok: false, retryAfter: verdict.retryAfter, scope, ...(verdict.unavailable ? { unavailable: true as const } : {}) }
  }
  return { ok: true }
}

/** The one 429 every limited call returns. It names no record and says nothing about whether one exists. */
export function tooManyResponse(quota: Extract<Quota, { ok: false }>, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: quota.unavailable ? 'service_unavailable' : 'too_many_requests', retryAfter: quota.retryAfter }), {
    status: quota.unavailable ? 503 : 429,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'retry-after': String(quota.retryAfter), 'cache-control': 'no-store' },
  })
}
