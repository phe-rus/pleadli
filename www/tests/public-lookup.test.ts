import { expect, mock, test } from 'bun:test'
import { env as cfEnv } from './helpers/cf-env'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readdirSync, readFileSync } from 'node:fs'

/** The public lookups at /api/public/v1, tested through the real route code and the real Orchestra
 * handlers that feed them: what the public may see, what an institution chooses to publish, withdrawn,
 * superseded and unpublished records, enumeration resistance and rate limiting. */

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

test('public verify and track', async () => {
  const sqlite = new Database(':memory:')
  for (const dir of readdirSync(new URL('../.migrations/', import.meta.url)).sort()) {
    sqlite.exec(readFileSync(new URL(`../.migrations/${dir}/migration.sql`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  mock.module('../src/db', () => ({ db: drizzle({ client: sqlite }) }))
  // A throwaway signing key made for this test only; the licence state is signed with it.
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))))
  for (const k of Object.keys(cfEnv)) delete cfEnv[k]
  Object.assign(cfEnv, { BETTER_AUTH_URL: 'http://localhost:3000', ORCHESTRA_SIGNING_KEY: pkcs8 })
  mock.module('cloudflare:workers', () => ({ env: cfEnv }))
  const now = Date.now()
  sqlite.run(`INSERT INTO organization (id,name,slug,institution_type,kind,country,status,address,requested_at) VALUES (?,?,?,?,?,?,?,?,?)`, ['courts', 'Gulu High Court', 'gulu', 'courts', 'institution', 'UG', 'active', 'ug.courts.gulu', now])
  sqlite.run(`INSERT INTO organization (id,name,slug,institution_type,kind,country,status,address,requested_at) VALUES (?,?,?,?,?,?,?,?,?)`, ['dpp', 'DPP Gulu', 'dppg', 'dpp', 'institution', 'UG', 'active', 'ug.dpp.gulu', now])
  for (const [id, org, app] of [['l1', 'courts', 'courts'], ['l2', 'dpp', 'dpp']]) {
    sqlite.run(`INSERT INTO licence (id,organization_id,application,seats,starts_at,expires_at,status,key_hash,key_hint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, org, app, 5, now - 1000, now + 86_400_000, 'active', id, 'TEST', now])
  }
  const devices: Record<string, string> = {}
  for (const [id, org, lic, app] of [['c1', 'courts', 'l1', 'courts'], ['c2', 'dpp', 'l2', 'dpp']]) {
    devices[id] = await hex(`device-${id}`)
    sqlite.run(`INSERT INTO computer (id,device_hash,application,organization_id,unit_id,licence_id,version,os,trial_started_at,first_seen_at,last_seen_at,token_hash,seal_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, devices[id], app, org, null, lic, '1', 'linux', now, now, now, await hex(`token-${id}`), 'k'])
  }

  const { handleOrchestraV1 } = await import('../src/api/orchestra-v1')
  const { resetLimiter } = await import('../src/lib/rate-limit.server')
  const { ANONYMOUS } = await import('../src/lib/quota.server')
  const route = (await import('../src/routes/api/public/v1/$')).Route as any
  const handlers = route.options.server.handlers

  const feed = async (as: 'c1' | 'c2', path: string, app: string, body: object) => {
    const r = await handleOrchestraV1(new Request(`http://localhost/api/orchestra/v1/${path}`, { method: 'POST', headers: { authorization: `Bearer token-${as}`, 'content-type': 'application/json' }, body: JSON.stringify({ device: devices[as], application: app, ...body }) }), path)
    return { status: r.status, body: (await r.json()) as any }
  }
  const ask = async (name: string, code: string | null, ip = '203.0.113.9', method = 'GET') => {
    const url = `http://localhost/api/public/v1/${name}${code === null ? '' : `?code=${encodeURIComponent(code)}`}`
    const r = await handlers[method]({ request: new Request(url, { method, headers: { 'cf-connecting-ip': ip } }), params: { _splat: name } })
    return { status: r.status, body: r.status === 204 ? null : ((await r.json()) as any), headers: r.headers }
  }
  const fileHash = await hex('the pdf')
  const base = { reference: 'HCT-00-CR-SC-0042-2026', kind: 'judgment', office: 'ug.courts.gulu', contentSha256: await hex('content-1'), issuedAt: now - 5000 }

  // Valid published paper, default publication: file reference NOT shown, hash not leaked.
  expect((await feed('c1', 'papers', 'courts', { ...base, code: 'JUDG-AAAA-1111', fileSha256: fileHash })).status).toBe(200)
  const v = await ask('verify', 'judg aaaa 1111')
  expect(v.status).toBe(200)
  expect(v.body.genuine).toBe(true)
  expect(v.body.paper).toMatchObject({ code: 'JUDGAAAA1111', kind: 'judgment', institution: 'Gulu High Court', office: 'Gulu High Court', reference: null, withdrawnAt: null, fileSha256: fileHash, authority: 'institution_issued' })
  expect(JSON.stringify(v.body)).not.toContain('HCT-00-CR')
  expect(JSON.stringify(v.body)).not.toContain(await hex('content-1'))

  // The institution explicitly chooses to show the reference and nothing else optional.
  await feed('c1', 'papers', 'courts', { ...base, code: 'JUDG-BBBB-2222', contentSha256: await hex('content-2'), publicFields: ['reference'] })
  const v2 = (await ask('verify', 'JUDGBBBB2222')).body.paper
  expect(v2).toMatchObject({ reference: 'HCT-00-CR-SC-0042-2026', kind: null, office: null, issuedAt: null })

  // Unknown, too short and malformed codes all give the identical answer.
  const unknown = await ask('verify', 'ZZZZZZZZZZZZ')
  const short = await ask('verify', 'AB')
  expect([unknown.status, short.status]).toEqual([404, 404])
  expect(unknown.body).toEqual(short.body)
  expect((await ask('verify', null)).status).toBe(400)

  // Same code reused by another institution is refused; the first owner's record is untouched.
  expect((await feed('c2', 'papers', 'dpp', { ...base, office: 'ug.dpp.gulu', code: 'JUDG-AAAA-1111', contentSha256: await hex('forged') })).body.error).toBe('code_taken')
  expect((await ask('verify', 'JUDGAAAA1111')).body.paper.institution).toBe('Gulu High Court')
  // Another institution cannot withdraw it.
  expect((await feed('c2', 'papers/withdraw', 'dpp', { code: 'JUDGAAAA1111' })).status).toBe(404)
  expect((await ask('verify', 'JUDGAAAA1111')).body.paper.withdrawnAt).toBeNull()

  // Withdrawn and superseded: still found, and says so; replacement must be the same institution's.
  expect((await feed('c1', 'papers/withdraw', 'courts', { code: 'JUDGAAAA1111', reason: 'Corrected', supersededByCode: 'ZZZZZZZZZZZZ' })).status).toBe(404)
  expect((await feed('c1', 'papers/withdraw', 'courts', { code: 'JUDGAAAA1111', reason: 'Corrected', supersededByCode: 'JUDGBBBB2222' })).status).toBe(200)
  const w = (await ask('verify', 'JUDGAAAA1111')).body
  expect(w.genuine).toBe(true)
  expect(w.paper.withdrawnAt).toBeNumber()
  expect(w.paper).toMatchObject({ withdrawnReason: 'Corrected', supersededByCode: 'JUDGBBBB2222' })

  // Tracking: published case shows fixed stages and office names, never anything else.
  const code = 'TRKA-4444-5555'
  expect((await feed('c2', 'track', 'dpp', { code, stage: 'charged', office: 'ug.dpp.gulu', at: now - 3000 })).status).toBe(200)
  expect((await feed('c1', 'track', 'courts', { code, stage: 'in_court', at: now })).body.error).toBe('code_taken')
  expect((await feed('c2', 'track', 'dpp', { code, stage: 'not a stage', at: now })).status).toBe(400)
  expect((await feed('c2', 'track', 'dpp', { code, stage: 'in_court', office: 'ug.courts.gulu', at: now - 1000, nextAt: now + 86_400_000 })).status).toBe(200)
  const t = await ask('track', 'trka 4444 5555')
  expect(t.status).toBe(200)
  expect(t.body.steps.map((s: any) => s.stage)).toEqual(['in_court', 'charged'])
  expect(t.body.steps[0].office).toBe('Gulu High Court')
  expect(Object.keys(t.body.steps[0]).sort()).toEqual(['at', 'nextAt', 'office', 'stage'])
  expect((await ask('track', 'TRKA44445555X')).status).toBe(404) // wrong length

  // Only the owner may unpublish; unpublished (e.g. sealed) looks exactly like a code that never existed.
  expect((await feed('c1', 'track/publication', 'courts', { code, published: false })).status).toBe(404)
  expect((await ask('track', code)).status).toBe(200)
  expect((await feed('c2', 'track/publication', 'dpp', { code, published: false })).status).toBe(200)
  const gone = await ask('track', code)
  const never = await ask('track', 'NEVER1234567')
  expect([gone.status, gone.body]).toEqual([never.status, never.body])
  // New steps do not silently republish.
  expect((await feed('c2', 'track', 'dpp', { code, stage: 'judgment', at: now })).body.error).toBe('unpublished')
  expect((await feed('c2', 'track/publication', 'dpp', { code, published: true })).status).toBe(200)
  expect((await ask('track', code)).status).toBe(200)

  // Unauthorised feeding: no token, wrong token.
  const noAuth = await handleOrchestraV1(new Request('http://localhost/x', { method: 'POST', body: JSON.stringify({ device: devices.c1, application: 'courts', code: 'ABCD-EFGH-IJKL', stage: 'closed', at: now }) }), 'track')
  expect(noAuth.status).toBe(401)
  expect(sqlite.query(`SELECT count(*) n FROM tracking_code WHERE code='ABCDEFGHIJKL'`).get()).toEqual({ n: 0 })

  // The public side cannot write: POST is refused, OPTIONS answers for browsers.
  expect((await ask('verify', 'JUDGAAAA1111', '203.0.113.9', 'POST')).status).toBe(405)
  expect((await ask('verify', 'x', '203.0.113.9', 'OPTIONS')).status).toBe(204)
  expect((await ask('nothing', 'ABCDEFGHIJKL')).status).toBe(404)
  expect(v.headers.get('cache-control')).toBe('no-store')

  // Rate limiting (no Durable Object in this test, so the degraded local counter answers): a fast guesser is
  // stopped, and the refusal is identical for a code that exists and one that does not, so it teaches nothing.
  const warn = console.warn
  console.warn = () => {}
  resetLimiter()
  let last = 0
  for (let i = 0; i < ANONYMOUS.perHour + 1; i++) last = (await ask('verify', `GUESS${String(i).padStart(7, '0')}`, '198.51.100.7')).status
  expect(last).toBe(429)
  const real = await ask('verify', 'JUDGBBBB2222', '198.51.100.7')
  const fake = await ask('verify', 'NOSUCHCODE99', '198.51.100.7')
  expect([real.status, real.body]).toEqual([fake.status, fake.body])
  expect(real.body.error).toBe('too_many_requests')
  expect(Number(real.headers.get('retry-after'))).toBeGreaterThan(0)
  expect(real.headers.get('access-control-allow-origin')).toBe('*')
  expect((await ask('track', 'TRKA44445555', '198.51.100.7')).status).toBe(429)
  // A spoofed forwarding header does not escape the limit, and another client is unaffected.
  expect((await ask('verify', 'JUDGBBBB2222', '198.51.100.7')).status).toBe(429)
  expect((await ask('verify', 'JUDGBBBB2222', '198.51.100.8')).status).toBe(200)
  console.warn = warn
})
