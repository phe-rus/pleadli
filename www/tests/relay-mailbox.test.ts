import { expect, mock, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readdirSync, readFileSync } from 'node:fs'

/** The bug: an app showed its institution's address, but mail is delivered to the address of the OFFICE the computer
 * belongs to, so a court that used the shown address posted into a mailbox nobody collects. These tests use
 * addresses that intentionally differ and go through the real relay handler. */

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('mail goes to the address a computer really collects at, offices of one institution are isolated, and nothing is posted to a dead address', async () => {
  const sqlite = new Database(':memory:')
  for (const dir of readdirSync(new URL('../.migrations/', import.meta.url)).sort()) {
    sqlite.exec(readFileSync(new URL(`../.migrations/${dir}/migration.sql`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''))
  }
  const blobs = new Map<string, ArrayBuffer>()
  mock.module('../src/db', () => ({ db: drizzle({ client: sqlite }) }))
  mock.module('cloudflare:workers', () => ({
    env: {
      BETTER_AUTH_URL: 'http://localhost:3000',
      POSTBOX: { put: async (k: string, v: ArrayBuffer) => void blobs.set(k, v), get: async (k: string) => (blobs.has(k) ? { arrayBuffer: async () => blobs.get(k)! } : null), delete: async (k: string) => void blobs.delete(k) },
    },
  }))
  const now = Date.now()
  const org = (id: string, type: string, address: string) =>
    sqlite.run(`INSERT INTO organization (id,name,slug,institution_type,kind,country,status,address,requested_at) VALUES (?,?,?,?,?,?,?,?,?)`, [id, `${id} institution`, id, type, 'institution', 'UG', 'active', address, now])
  const unit = (id: string, orgId: string, address: string) => sqlite.run(`INSERT INTO organization_unit (id,organization_id,name,kind,address) VALUES (?,?,?,?,?)`, [id, orgId, `${id} office`, 'office', address])
  const lic = (id: string, orgId: string, app: string) =>
    sqlite.run(`INSERT INTO licence (id,organization_id,application,seats,starts_at,expires_at,status,key_hash,key_hint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, orgId, app, 5, now - 1000, now + 86_400_000, 'active', id, 'TEST', now])
  const pc = async (id: string, orgId: string, unitId: string | null, licId: string, app: string) =>
    sqlite.run(`INSERT INTO computer (id,device_hash,application,organization_id,unit_id,licence_id,version,os,trial_started_at,first_seen_at,last_seen_at,token_hash,seal_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, id, app, orgId, unitId, licId, '1', 'linux', now, now, now, await hex(`token-${id}`), 'k'])

  // One DPP institution whose address differs from both of its offices; a court with no office at all.
  org('dpp', 'dpp', 'ug.dpp.hoima')
  unit('dpp-a', 'dpp', 'ug.dpp.hoima.office')
  unit('dpp-b', 'dpp', 'ug.dpp.hoima.annex')
  unit('dpp-empty', 'dpp', 'ug.dpp.hoima.nobody')
  org('court', 'courts', 'ug.courts.gulu')
  org('police', 'police', 'ug.police.gulu')
  lic('l-dpp', 'dpp', 'dpp'); lic('l-court', 'court', 'courts'); lic('l-police', 'police', 'police')
  await pc('pc-a', 'dpp', 'dpp-a', 'l-dpp', 'dpp')
  await pc('pc-b', 'dpp', 'dpp-b', 'l-dpp', 'dpp')
  await pc('pc-court', 'court', null, 'l-court', 'courts')
  await pc('pc-police', 'police', null, 'l-police', 'police')
  const link = (a: string, b: string, n: number) =>
    sqlite.run(`INSERT INTO relay_link (id,from_address,to_address,status,requested_by,decided_by,created_at,decided_at) VALUES (?,?,?,?,?,?,?,?)`, [`link-${n}`, a, b, 'approved', 'x', 'x', now, now])
  link('ug.courts.gulu', 'ug.dpp.hoima.office', 1)
  link('ug.courts.gulu', 'ug.dpp.hoima.annex', 2)
  link('ug.courts.gulu', 'ug.dpp.hoima', 3)
  link('ug.courts.gulu', 'ug.dpp.hoima.nobody', 4)
  link('ug.courts.gulu', 'ug.police.gulu', 5)

  const { handleRelayV1 } = await import('../src/api/relay-v1')
  const call = async (as: string, method: string, path: string, init: { headers?: Record<string, string>; body?: BodyInit } = {}) => {
    const r = await handleRelayV1(new Request(`http://localhost:3000/api/orchestra/v1/relay/${path}`, { method, headers: { authorization: `Bearer token-${as}`, ...init.headers }, body: init.body }), path)
    return { status: r.status, body: (await r.json()) as any }
  }
  const post = async (as: string, to: string, kind: string, n: number, text = 'sealed bytes') =>
    call(as, 'POST', 'messages', { body: text, headers: { 'x-pleadli-id': UUID(n), 'x-pleadli-to': to, 'x-pleadli-kind': kind, 'x-pleadli-sha256': await hex(text), 'content-type': 'application/octet-stream' } })

  // 1. The relay says where each computer's mail really goes, and it is the office, not the institution.
  expect((await call('pc-a', 'GET', 'whoami')).body.address).toBe('ug.dpp.hoima.office')
  expect((await call('pc-b', 'GET', 'whoami')).body.address).toBe('ug.dpp.hoima.annex')
  expect((await call('pc-court', 'GET', 'whoami')).body.address).toBe('ug.courts.gulu')
  expect((await call('pc-a', 'GET', 'whoami')).body.name).toContain('dpp-a office')

  // 2. The address an app used to show (the institution's) has no mailbox: refused with an actionable reason, nothing stored.
  const dead = await post('pc-court', 'ug.dpp.hoima', 'filing_receipt', 1)
  expect([dead.status, dead.body.error]).toEqual([422, 'no_mailbox'])
  expect(dead.body.message).toContain('receiving address')
  const dead2 = await post('pc-court', 'ug.dpp.hoima.nobody', 'filing_receipt', 2)
  expect(dead2.body.error).toBe('no_mailbox')
  expect(sqlite.query(`SELECT count(*) n FROM relay_message`).get()).toEqual({ n: 0 })
  expect(blobs.size).toBe(0)
  // Asking to connect to a dead address is refused too, not left pending.
  expect((await call('pc-court', 'POST', 'connections', { body: JSON.stringify({ to: 'ug.dpp.hoima.nobody' }) })).body.error).toBe('no_mailbox')

  // 3. A message to a real office arrives there and ONLY there (two offices of one institution are isolated).
  expect((await post('pc-court', 'ug.dpp.hoima.office', 'filing_receipt', 3)).status).toBe(201)
  expect((await post('pc-court', 'ug.dpp.hoima.annex', 'filing_receipt', 4, 'other bytes')).status).toBe(201)
  const inboxA = (await call('pc-a', 'GET', 'inbox')).body.items.map((i: any) => i.id)
  const inboxB = (await call('pc-b', 'GET', 'inbox')).body.items.map((i: any) => i.id)
  expect(inboxA).toEqual([UUID(3)])
  expect(inboxB).toEqual([UUID(4)])
  expect((await call('pc-a', 'GET', `messages/${UUID(4)}`)).status).toBe(404)
  expect((await call('pc-court', 'GET', 'inbox')).body.items).toEqual([])
  // The other direction: an office posts to the court's real mailbox, from its own office address.
  expect((await post('pc-a', 'ug.courts.gulu', 'case_filing', 5)).status).toBe(201)
  expect((await call('pc-court', 'GET', 'inbox')).body.items.map((i: any) => [i.id, i.from])).toEqual([[UUID(5), 'ug.dpp.hoima.office']])

  // 4. The same institution is NOT an exception to message authorization: one DPP office posting a referral to another
  // DPP office is refused, and so is a kind that has no path between two linked institutions.
  const same = await post('pc-a', 'ug.dpp.hoima.annex', 'referral', 6)
  expect([same.status, same.body.error]).toEqual([403, 'not_permitted'])
  const wrong = await post('pc-court', 'ug.police.gulu', 'custody_order', 7)
  expect([wrong.status, wrong.body.error]).toEqual([403, 'not_permitted'])
  expect((await call('pc-a', 'POST', 'connections', { body: JSON.stringify({ to: 'ug.dpp.hoima.annex' }) })).body.error).toBe('not_permitted')
})

test('belonging to the same institution does not excuse a message from authorization', async () => {
  // Reuses the first test's module state: same-institution posts need a path for the kind, like any other.
  const { relayPermitted, relayPairAllowed } = await import('../src/lib/relay-paths')
  expect(relayPermitted('dpp', 'dpp', 'referral')).toBe(false)
  expect(relayPermitted('police', 'police', 'referral')).toBe(false)
  expect(relayPairAllowed('dpp', 'dpp')).toBe(false)
})
