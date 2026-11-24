import { expect, mock, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { env as cfEnv } from './helpers/cf-env'

/** The private support channel: only the versioned bundle shape is accepted, a retry is not stored twice,
 * and only the computer that sent a report can ask about it. */

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

test('diagnostic reports: strict shape, idempotent, private to the sender', async () => {
  const sqlite = new Database(':memory:')
  for (const dir of readdirSync(new URL('../.migrations/', import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../.migrations/${dir}/migration.sql`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''))
  mock.module('../src/db', () => ({ db: drizzle({ client: sqlite }) }))
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  for (const k of Object.keys(cfEnv)) delete cfEnv[k]
  Object.assign(cfEnv, { BETTER_AUTH_URL: 'http://localhost:3000', ORCHESTRA_SIGNING_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)))) })
  mock.module('cloudflare:workers', () => ({ env: cfEnv }))
  const now = Date.now()
  const devices: Record<string, string> = {}
  // Two computers; the second is a trial copy with no organisation and no licence: it must still be able to report a crash.
  sqlite.run(`INSERT INTO organization (id,name,slug,institution_type,kind,country,status,address,requested_at) VALUES (?,?,?,?,?,?,?,?,?)`, ['o1', 'Okello Advocates', 'o1', 'lawyers', 'institution', 'UG', 'active', 'ug.lawyers.o1', now])
  for (const [id, org] of [['a', 'o1'], ['b', null]] as const) {
    devices[id] = await hex(`device-${id}`)
    sqlite.run(`INSERT INTO computer (id,device_hash,application,organization_id,unit_id,licence_id,version,os,trial_started_at,first_seen_at,last_seen_at,token_hash,seal_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, devices[id], 'lawyers', org, null, null, '1', 'linux', now, now, now, await hex(`token-${id}`), 'k'])
  }
  const { handleOrchestraV1 } = await import('../src/api/orchestra-v1')
  const send = async (as: string | null, path: string, body: object) => {
    const r = await handleOrchestraV1(new Request(`http://localhost/api/orchestra/v1/${path}`, { method: 'POST', headers: { ...(as ? { authorization: `Bearer token-${as}` } : {}), 'content-type': 'application/json' }, body: JSON.stringify({ device: devices[as ?? 'a'], application: 'lawyers', ...body }) }), path)
    return { status: r.status, body: (await r.json()) as any }
  }
  const bundle = (over: object = {}) => ({
    format: 1, report_id: crypto.randomUUID(), kind: 'crash', app: 'lawyers', app_version: '0.1.4', os: 'linux', arch: 'x86_64', created_at: now, error_code: 'crash', description: '',
    crash: { source: 'rust_panic', location: 'matters.rs:214', message: 'called unwrap on [path]/cases.db', frames: ['lawyers::matters::close'] },
    events: [{ at: now, code: 'sync.failed', detail: null }], ...over,
  })

  const good = bundle()
  const first = await send('a', 'diagnostics', { bundle: good })
  expect(first.body).toEqual({ ok: true, reportId: good.report_id })
  // The existing support inbox holds it: kind crash, open, titled for staff, the bundle as the body.
  const row = sqlite.query(`SELECT kind, status, application, version, organization_id, computer_id, title, body FROM support_report WHERE id = ?`).get(good.report_id) as any
  expect(row).toMatchObject({ kind: 'crash', status: 'open', application: 'lawyers', version: '0.1.4', organization_id: 'o1', computer_id: 'a', title: 'Crash in lawyers 0.1.4: crash' })
  expect(JSON.parse(row.body)).toEqual(good)
  // A retry is the same report.
  expect((await send('a', 'diagnostics', { bundle: good })).body).toEqual({ ok: true, reportId: good.report_id, duplicate: true })
  expect(sqlite.query(`SELECT count(*) n FROM support_report`).get()).toEqual({ n: 1 })
  // Another computer cannot take over or overwrite someone's report id.
  expect((await send('b', 'diagnostics', { bundle: good })).body.error).toBe('report_taken')

  // A trial copy (no organisation, no licence) can report.
  expect((await send('b', 'diagnostics', { bundle: bundle({ kind: 'bug', error_code: null, description: 'Saving a note fails.', crash: null }) })).status).toBe(200)

  // Nothing outside the format gets in: extra fields, at any depth, are refused, and so are bad shapes.
  for (const bad of [
    bundle({ caseNotes: 'Okello statement' }),
    bundle({ crash: { source: 'rust_panic', location: null, message: 'x', frames: [], clientName: 'Okello' } }),
    bundle({ events: [{ at: now, code: 'sync.failed', detail: null, caseId: '123' }] }),
    bundle({ events: [{ at: now, code: 'Case: Uganda v Okello', detail: null }] }),
    bundle({ format: 2 }),
    bundle({ kind: 'secret' }),
    bundle({ report_id: 'not-a-uuid' }),
    bundle({ events: Array.from({ length: 201 }, () => ({ at: now, code: 'tick', detail: null })) }),
    bundle({ description: 'x'.repeat(2_200) }),
  ]) {
    const r = await send('a', 'diagnostics', { bundle: bad })
    expect(r.status).toBe(400)
  }
  expect(sqlite.query(`SELECT count(*) n FROM support_report`).get()).toEqual({ n: 2 })
  // A report for another application than the one asking is refused.
  expect((await send('a', 'diagnostics', { bundle: bundle({ app: 'police' }) })).body.error).toBe('mismatch')
  // Not activated: no token, or the wrong one.
  expect((await send(null, 'diagnostics', { bundle: bundle() })).status).toBe(401)

  // Only the sender can ask what support said; staff replies come through the existing inbox fields.
  sqlite.run(`UPDATE support_report SET status = 'answered', reply = 'Update to 0.1.5', replied_at = ? WHERE id = ?`, [now, good.report_id])
  const status = await send('a', 'diagnostics/status', { reportId: good.report_id })
  expect(status.body).toMatchObject({ ok: true, status: 'answered', reply: 'Update to 0.1.5' })
  expect((await send('b', 'diagnostics/status', { reportId: good.report_id })).status).toBe(404)
  expect((await send('a', 'diagnostics/status', { reportId: crypto.randomUUID() })).status).toBe(404)
})
