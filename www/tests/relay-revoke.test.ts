import { expect, mock, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readdirSync, readFileSync } from 'node:fs'

/** An office ends a connection from its app (POST relay/connections/revoke). It needs a reason, only the two ends of a
 * live link may do it, the mail still waiting between them is dropped, and the relay refuses both directions after. */

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('an office ends a connection with a reason, waiting mail is dropped and the relay then refuses both directions', async () => {
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

  org('dpp', 'dpp', 'ug.dpp.hoima')
  unit('dpp-a', 'dpp', 'ug.dpp.hoima.office')
  org('police', 'police', 'ug.police.gulu')
  org('court', 'courts', 'ug.courts.gulu')
  lic('l-dpp', 'dpp', 'dpp'); lic('l-police', 'police', 'police'); lic('l-court', 'court', 'courts')
  await pc('pc-dpp', 'dpp', 'dpp-a', 'l-dpp', 'dpp')
  await pc('pc-police', 'police', null, 'l-police', 'police')
  await pc('pc-court', 'court', null, 'l-court', 'courts')
  sqlite.run(`INSERT INTO relay_link (id,from_address,to_address,status,requested_by,decided_by,created_at,decided_at) VALUES (?,?,?,?,?,?,?,?)`, ['link-1', 'ug.dpp.hoima.office', 'ug.police.gulu', 'approved', 'x', 'x', now, now])

  const { handleRelayV1 } = await import('../src/api/relay-v1')
  const call = async (as: string, method: string, path: string, init: { headers?: Record<string, string>; body?: BodyInit } = {}) => {
    const r = await handleRelayV1(new Request(`http://localhost:3000/api/orchestra/v1/relay/${path}`, { method, headers: { authorization: `Bearer token-${as}`, ...init.headers }, body: init.body }), path)
    return { status: r.status, body: (await r.json()) as any }
  }
  const post = async (as: string, to: string, kind: string, n: number, text = 'sealed bytes') =>
    call(as, 'POST', 'messages', { body: text, headers: { 'x-pleadli-id': UUID(n), 'x-pleadli-to': to, 'x-pleadli-kind': kind, 'x-pleadli-sha256': await hex(text), 'content-type': 'application/octet-stream' } })
  const revoke = (as: string, body: unknown) => call(as, 'POST', 'connections/revoke', { body: JSON.stringify(body) })

  // Mail is waiting in both directions.
  expect((await post('pc-police', 'ug.dpp.hoima.office', 'referral', 1)).status).toBe(201)
  expect((await post('pc-dpp', 'ug.police.gulu', 'receipt', 2)).status).toBe(201)
  expect(sqlite.query(`SELECT count(*) n FROM relay_message`).get()).toEqual({ n: 2 })

  // A reason is required, bad input is refused, and an office outside the link cannot end it.
  expect((await revoke('pc-dpp', { with: 'ug.police.gulu' })).body.error).toBe('reason_needed')
  expect((await revoke('pc-dpp', { with: 'not an address', reason: 'x' })).status).toBe(400)
  expect((await revoke('pc-court', { with: 'ug.police.gulu', reason: 'Not my link.' })).status).toBe(404)
  expect((await revoke('pc-dpp', { with: 'ug.courts.gulu', reason: 'No link with them.' })).status).toBe(404)
  expect(sqlite.query(`SELECT status FROM relay_link WHERE id='link-1'`).get()).toEqual({ status: 'approved' })
  expect(sqlite.query(`SELECT count(*) n FROM relay_message`).get()).toEqual({ n: 2 })

  // The DPP ends it: the link is revoked with the reason, the waiting mail and its bytes are gone.
  const ended = await revoke('pc-dpp', { with: 'ug.police.gulu', reason: 'Station key was lost.' })
  expect([ended.status, ended.body.status]).toEqual([200, 'revoked'])
  expect(sqlite.query(`SELECT status, reason FROM relay_link WHERE id='link-1'`).get()).toEqual({ status: 'revoked', reason: 'Station key was lost.' })
  expect(sqlite.query(`SELECT count(*) n FROM relay_message`).get()).toEqual({ n: 0 })
  expect(blobs.size).toBe(0)

  // Both directions are now refused by the relay itself, and ending it twice finds nothing live.
  const fromPolice = await post('pc-police', 'ug.dpp.hoima.office', 'referral', 3)
  expect([fromPolice.status, fromPolice.body.error]).toEqual([403, 'not_connected'])
  const fromDpp = await post('pc-dpp', 'ug.police.gulu', 'receipt', 4)
  expect([fromDpp.status, fromDpp.body.error]).toEqual([403, 'not_connected'])
  expect((await revoke('pc-dpp', { with: 'ug.police.gulu', reason: 'Again.' })).status).toBe(404)
  expect((await revoke('pc-police', { with: 'ug.dpp.hoima.office', reason: 'Also again.' })).status).toBe(404)
})
