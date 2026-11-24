import { beforeEach, expect, mock, test } from 'bun:test'
import { env } from './helpers/cf-env'
import { hitWindow, type WindowState } from '../src/lib/quota-window'

/** The strict quotas: a fake Durable Object namespace that counts with the same rule as the real one
 * (`quota-window.ts`, which the real class calls), a fake Rate Limiting binding, and a clock the tests move.
 * What this does NOT prove: that Cloudflare serialises calls to one real object (a platform guarantee), or
 * that the dashboard WAF rule exists. Neither can be shown from here. */

let clock = 1_000_000
const counters = new Map<string, WindowState>()
const edge = new Map<string, number>()
let doDown = false

function install() {
  counters.clear()
  edge.clear()
  doDown = false
  env.QUOTA = {
    idFromName: (name: string) => name,
    get: (name: string) => ({
      hit: async (limit: number, windowMs: number) => {
        if (doDown) throw new Error('Durable Object unavailable')
        const { state, verdict } = hitWindow(counters.get(name), limit, windowMs, clock)
        counters.set(name, state)
        return verdict
      },
    }),
  }
  env.PUBLIC_LOOKUP = { limit: async ({ key }: { key: string }) => ({ success: (edge.set(key, (edge.get(key) ?? 0) + 1), edge.get(key)! <= 30) }) }
}
mock.module('cloudflare:workers', () => ({ env }))
const { limitAnonymous, limitAuthenticated, limitOfficer, OFFICER, tooManyResponse, ANONYMOUS, AUTHENTICATED } = await import('../src/lib/quota.server')
const { resetLimiter } = await import('../src/lib/rate-limit.server')
const realNow = Date.now
beforeEach(() => {
  install()
  resetLimiter()
  clock = 1_000_000
  Date.now = () => clock
})

const from = (ip: string | null, extra: Record<string, string> = {}) => new Request('http://x/api/public/v1/verify?code=ABCDEFGH', { headers: { ...(ip ? { 'cf-connecting-ip': ip } : {}), ...extra } })

test('the strict anonymous quota counts per connecting address, worldwide, and expires', async () => {
  env.PUBLIC_LOOKUP = undefined // isolate the strict layer from the edge shedder
  for (let i = 0; i < ANONYMOUS.perHour; i++) expect((await limitAnonymous(from('203.0.113.1'))).ok).toBe(true)
  const refused = await limitAnonymous(from('203.0.113.1'))
  expect(refused).toMatchObject({ ok: false, scope: 'anonymous' })
  expect((refused as any).retryAfter).toBeGreaterThan(0)
  expect((refused as any).retryAfter).toBeLessThanOrEqual(3600)
  // Another visitor is untouched.
  expect((await limitAnonymous(from('203.0.113.2'))).ok).toBe(true)
  // A refused request does not extend the window; once it ends the visitor is let in again.
  clock += 3_600_000
  expect((await limitAnonymous(from('203.0.113.1'))).ok).toBe(true)
})

test('a caller cannot choose its own bucket: spoofed headers change nothing, and no address is stored', async () => {
  env.PUBLIC_LOOKUP = undefined
  for (let i = 0; i < ANONYMOUS.perHour; i++) await limitAnonymous(from('203.0.113.1', { 'x-forwarded-for': `10.0.0.${i % 250}`, 'x-real-ip': `10.1.1.${i % 250}`, 'x-client-id': `c${i}` }))
  expect((await limitAnonymous(from('203.0.113.1', { 'x-forwarded-for': '198.51.100.99' }))).ok).toBe(false)
  for (const name of counters.keys()) {
    expect(name).not.toContain('203.0.113.1')
    expect(name).toMatch(/^anon:[0-9a-f]{24}$/)
  }
  // Requests with no address share one strict bucket instead of escaping the limit.
  for (let i = 0; i < ANONYMOUS.perHour; i++) await limitAnonymous(from(null))
  expect((await limitAnonymous(from(null))).ok).toBe(false)
})

test('the edge binding sheds a fast burst early and says to wait the period; it is only the first layer', async () => {
  for (let i = 0; i < 30; i++) expect((await limitAnonymous(from('203.0.113.7'))).ok).toBe(true)
  const shed = await limitAnonymous(from('203.0.113.7'))
  expect(shed).toMatchObject({ ok: false, scope: 'edge', retryAfter: 60 })
  expect(counters.size).toBe(1) // the shed request never reached the Durable Object
})

test('concurrent requests cannot overshoot the quota', async () => {
  env.PUBLIC_LOOKUP = undefined
  const results = await Promise.all(Array.from({ length: ANONYMOUS.perHour * 3 }, () => limitAnonymous(from('203.0.113.3'))))
  expect(results.filter((r) => r.ok).length).toBe(ANONYMOUS.perHour)
  const user = { credentialId: 'cred-1', organizationId: 'org-1', userId: 'u-1' }
  const mixed = await Promise.all(Array.from({ length: AUTHENTICATED.user.limit * 2 }, () => limitAuthenticated(user)))
  expect(mixed.filter((r) => r.ok).length).toBe(AUTHENTICATED.user.limit)
})

test('authenticated quotas are per user, per credential and per institution, keyed only by verified identity', async () => {
  // Two people on one application credential have their own limits but share the credential's.
  for (let i = 0; i < AUTHENTICATED.user.limit; i++) expect((await limitAuthenticated({ credentialId: 'cred-1', organizationId: 'org-1', userId: 'alice' })).ok).toBe(true)
  expect(await limitAuthenticated({ credentialId: 'cred-1', organizationId: 'org-1', userId: 'alice' })).toMatchObject({ ok: false, scope: 'user' })
  expect((await limitAuthenticated({ credentialId: 'cred-1', organizationId: 'org-1', userId: 'bob' })).ok).toBe(true)
  // Exhaust the whole credential with many users: then even a fresh user of it is refused, at the credential tier.
  for (let u = 0; u < 5; u++) for (let i = 0; i < AUTHENTICATED.user.limit; i++) await limitAuthenticated({ credentialId: 'cred-1', organizationId: 'org-1', userId: `user-${u}` })
  expect(await limitAuthenticated({ credentialId: 'cred-1', organizationId: 'org-1', userId: 'fresh' })).toMatchObject({ ok: false, scope: 'credential' })
  // Another credential of the same institution and another institution are not affected.
  expect((await limitAuthenticated({ credentialId: 'cred-2', organizationId: 'org-1', userId: 'alice' })).ok).toBe(true)
  expect((await limitAuthenticated({ credentialId: 'cred-9', organizationId: 'org-2' })).ok).toBe(true)
  // The whole institution has a ceiling above its credentials.
  for (let c = 0; c < 6; c++) for (let i = 0; i < AUTHENTICATED.credential.limit; i++) await limitAuthenticated({ credentialId: `many-${c}`, organizationId: 'org-3' })
  expect(await limitAuthenticated({ credentialId: 'many-new', organizationId: 'org-3' })).toMatchObject({ ok: false, scope: 'institution' })
  // Quotas expire.
  clock += 60_000
  expect((await limitAuthenticated({ credentialId: 'cred-1', organizationId: 'org-1', userId: 'alice' })).ok).toBe(true)
})

test('if the Durable Object is down the limit degrades to the local counter, it neither opens nor breaks the lookup', async () => {
  env.PUBLIC_LOOKUP = undefined
  doDown = true
  const warn = console.warn
  console.warn = () => {}
  try {
    for (let i = 0; i < ANONYMOUS.perHour; i++) expect((await limitAnonymous(from('203.0.113.4'))).ok).toBe(true)
    expect((await limitAnonymous(from('203.0.113.4'))).ok).toBe(false)
    expect((await limitAnonymous(from('203.0.113.5'))).ok).toBe(true)
  } finally {
    console.warn = warn
  }
})

test('protected calls FAIL CLOSED when the authoritative counter is down: never an isolate-local count', async () => {
  doDown = true
  const quiet = console.error
  console.error = () => {}
  try {
    const lookup = await limitAuthenticated({ credentialId: 'cred-1', organizationId: 'org-1', userId: 'alice' })
    expect(lookup).toMatchObject({ ok: false, unavailable: true })
    const operation = await limitOfficer({ organizationId: 'org-1', officerId: 'officer-1' })
    expect(operation).toMatchObject({ ok: false, unavailable: true })
    // Not even once, however few requests: nothing protected is served while the counter is unreachable.
    for (let i = 0; i < 5; i++) expect((await limitAuthenticated({ credentialId: 'cred-2', organizationId: 'org-2' })).ok).toBe(false)
    // The missing binding is the same thing as the counter being down.
    doDown = false
    const keep = env.QUOTA
    env.QUOTA = undefined
    expect(await limitAuthenticated({ credentialId: 'cred-3', organizationId: 'org-3' })).toMatchObject({ ok: false, unavailable: true })
    env.QUOTA = keep
    // And it recovers by itself.
    expect((await limitAuthenticated({ credentialId: 'cred-3', organizationId: 'org-3' })).ok).toBe(true)
    // The refusal is a 503 with Retry-After, not a 429, so a client does not mistake a fault for its own overuse.
    const r = tooManyResponse(lookup as never)
    expect([r.status, r.headers.get('retry-after')]).toEqual([503, '5'])
    expect(await r.json()).toEqual({ error: 'service_unavailable', retryAfter: 5 })
  } finally {
    console.error = quiet
  }
})

test('officer operations are limited per officer and per institution by the authoritative counter', async () => {
  for (let i = 0; i < OFFICER.officer.limit; i++) expect((await limitOfficer({ organizationId: 'org-1', officerId: 'o-1' })).ok).toBe(true)
  expect(await limitOfficer({ organizationId: 'org-1', officerId: 'o-1' })).toMatchObject({ ok: false, scope: 'officer' })
  expect((await limitOfficer({ organizationId: 'org-1', officerId: 'o-2' })).ok).toBe(true)
  clock += 60_000
  expect((await limitOfficer({ organizationId: 'org-1', officerId: 'o-1' })).ok).toBe(true)
})

test('every refusal is the same 429 with Retry-After and names no record', async () => {
  const r = tooManyResponse({ ok: false, retryAfter: 42, scope: 'anonymous' }, { 'access-control-allow-origin': '*' })
  expect(r.status).toBe(429)
  expect(r.headers.get('retry-after')).toBe('42')
  expect(r.headers.get('cache-control')).toBe('no-store')
  expect(await r.json()).toEqual({ error: 'too_many_requests', retryAfter: 42 })
  Date.now = realNow
})
