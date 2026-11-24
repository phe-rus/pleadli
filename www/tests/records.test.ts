import { expect, mock, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { env as cfEnv } from './helpers/cf-env'
import { hitWindow, type WindowState } from '../src/lib/quota-window'

/** The institution-controlled records API end to end: institutions publish and grant through the real
 * Orchestra handlers, callers look up through the real records handler. */

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

test('records API: disclosure is decided by the institution and enforced on the server', async () => {
  const sqlite = new Database(':memory:')
  for (const dir of readdirSync(new URL('../.migrations/', import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../.migrations/${dir}/migration.sql`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''))
  mock.module('../src/db', () => ({ db: drizzle({ client: sqlite }) }))
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  for (const k of Object.keys(cfEnv)) delete cfEnv[k]
  Object.assign(cfEnv, { BETTER_AUTH_URL: 'http://localhost:3000', ORCHESTRA_SIGNING_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)))) })
  // The authoritative counter, with the real counting rule (quota-window.ts). Protected calls fail closed without it.
  const counters = new Map<string, WindowState>()
  cfEnv.QUOTA = { idFromName: (n: string) => n, get: (n: string) => ({ hit: async (limit: number, windowMs: number) => { const r = hitWindow(counters.get(n), limit, windowMs, Date.now()); counters.set(n, r.state); return r.verdict } }) }
  mock.module('cloudflare:workers', () => ({ env: cfEnv }))
  const warn = console.warn
  console.warn = () => {}

  const now = Date.now()
  const orgs: [string, string, string, string, string][] = [
    ['police-gulu', 'Gulu Central Police Station', 'police', 'ug.police.gulu', 'UG'],
    ['police-lira', 'Lira Police Station', 'police', 'ug.police.lira', 'UG'],
    ['police-nbi', 'Nairobi Central Police', 'police', 'ke.police.nairobi', 'KE'],
    ['courts', 'Gulu High Court', 'courts', 'ug.courts.gulu', 'UG'],
    ['firm', 'Okello and Co Advocates', 'lawyers', 'ug.lawyers.okello', 'UG'],
    ['vendor', 'Case Tools Ltd', 'lawyers', 'ug.lawyers.casetools', 'UG'],
  ]
  const devices: Record<string, string> = {}
  for (const [id, name, type, address, country] of orgs) {
    sqlite.run(`INSERT INTO organization (id,name,slug,institution_type,kind,country,status,address,requested_at) VALUES (?,?,?,?,?,?,?,?,?)`, [id, name, id, type, 'institution', country, 'active', address, now])
    sqlite.run(`INSERT INTO licence (id,organization_id,application,seats,starts_at,expires_at,status,key_hash,key_hint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [`l-${id}`, id, type, 5, now - 1000, now + 86_400_000, 'active', `l-${id}`, 'TEST', now])
    devices[id] = await hex(`device-${id}`)
    sqlite.run(`INSERT INTO computer (id,device_hash,application,organization_id,unit_id,licence_id,version,os,trial_started_at,first_seen_at,last_seen_at,token_hash,seal_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [`pc-${id}`, devices[id], type, id, null, `l-${id}`, '1', 'linux', now, now, now, await hex(`token-pc-${id}`), 'k'])
  }
  const app = (id: string) => orgs.find((o) => o[0] === id)![2]
  // Each institution's owner has authorised one officer for everything, and set a publication policy for the kinds of
  // record this test publishes (there is no default policy). A separate test covers the refusals.
  const { createOfficer } = await import('../src/lib/records-authority.server')
  const officers: Record<string, string> = {}
  const everyAudience = JSON.stringify(['public', 'application', 'lawyer', 'party', 'institution'])
  const allowed = JSON.stringify(Object.fromEntries(['stage', 'station', 'offence', 'complainantName', 'investigatorNote', 'judge'].map((f) => [f, JSON.parse(everyAudience)])))
  for (const [id] of orgs) {
    officers[id] = (await createOfficer({ organizationId: id, name: `Officer of ${id}`, permissions: ['publish', 'approve', 'revoke', 'credentials', 'audit'], days: 30, createdBy: 'owner-user' })).secret
    for (const [jurisdiction, recordType, referenceKind] of [['UG', 'criminal_case', 'crb'], ['KE', 'criminal_case', 'crb']]) {
      sqlite.run(`INSERT INTO record_policy (id,organization_id,jurisdiction,record_type,reference_kind,allowed,enabled,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), id, jurisdiction, recordType, referenceKind, allowed, 1, 'owner-user', now])
    }
  }

  const { handleOrchestraV1 } = await import('../src/api/orchestra-v1')
  const { handleRecordsV1 } = await import('../src/lib/records.server')
  const { resetLimiter } = await import('../src/lib/rate-limit.server')

  const inst = async (as: string, path: string, body: object = {}) => {
    const r = await handleOrchestraV1(new Request(`http://localhost/api/orchestra/v1/${path}`, { method: 'POST', headers: { authorization: `Bearer token-pc-${as}`, 'x-officer-token': officers[as], 'content-type': 'application/json' }, body: JSON.stringify({ device: devices[as], application: app(as), ...body }) }), path)
    return { status: r.status, body: (await r.json()) as any }
  }
  const look = async (secret: string | null, params: Record<string, string>, ip = '203.0.113.50') => {
    const url = new URL('http://localhost/api/records/v1/records')
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const r = await handleRecordsV1(new Request(url, { headers: { 'cf-connecting-ip': ip, ...(secret ? { authorization: `Bearer ${secret}` } : {}) } }), 'records')
    const text = await r.text()
    return { status: r.status, body: JSON.parse(text) as any, text, headers: r.headers }
  }
  const cred = async (as: string, kind: string, name = `${as} credential`) => (await inst(as, 'records/credentials', { name, kind })).body as { id: string; secret: string }
  const grant = (as: string, body: object) => inst(as, 'records/grants', body)

  // --- Police publishes one case with an explicit audience per field.
  const crb = { jurisdiction: 'UG', recordType: 'criminal_case', referenceKind: 'crb', reference: 'CRB 123/2026' }
  const publish = (as: string, extra: object = {}) =>
    inst(as, 'records/publish', {
      ...crb,
      sourceUpdatedAt: now - 3_600_000,
      fields: { stage: 'Charged', station: 'Desk 7 CID', offence: 'Theft', complainantName: 'Akello Grace', investigatorNote: 'Informant is a neighbour' },
      fieldPolicy: { stage: 'public', station: ['application', 'lawyer', 'party', 'institution'], offence: ['lawyer', 'institution'], complainantName: ['party', 'institution'], investigatorNote: 'institution' },
      ...extra,
    })
  expect((await publish('police-gulu')).status).toBe(200)
  // A field without an audience is refused, never guessed.
  const incomplete = await inst('police-gulu', 'records/publish', { ...crb, reference: 'CRB 999/2026', sourceUpdatedAt: now, fields: { stage: 'Open', secret: 'x' }, fieldPolicy: { stage: 'public' } })
  expect([incomplete.status, incomplete.body.error]).toEqual([422, 'policy_incomplete'])
  expect((await look((await cred('firm', 'lawyer')).secret, { ...crb, kind: 'crb', reference: 'CRB 999/2026', jurisdiction: 'UG' })).body.count).toBe(0)

  const ask = { jurisdiction: 'UG', kind: 'crb', reference: 'crb-123-2026' } // another spelling of the same reference
  const firmCred = await cred('firm', 'lawyer', 'A. Okello (advocate)')
  const vendorCred = await cred('vendor', 'application', 'Case app')

  // --- Nobody is let in because of a label: a registered application and a self-declared lawyer see only what is public.
  for (const c of [firmCred, vendorCred]) {
    const r = await look(c.secret, ask)
    expect(r.status).toBe(200)
    expect(r.body.results[0].fields).toEqual({ stage: 'Charged' })
    expect(r.body.results[0].audience).toBe('public')
    for (const hidden of ['Desk 7', 'Theft', 'Akello', 'neighbour']) expect(r.text).not.toContain(hidden) // not in the response at all
  }

  // --- No credential, a guessed one, a malformed one: the same 401.
  const none = await look(null, ask)
  const guessed = await look('plr_' + 'A'.repeat(43), ask)
  expect([none.status, guessed.status]).toEqual([401, 401])
  expect(none.body).toEqual(guessed.body)
  expect((await look('Bearer', ask)).status).toBe(401)

  // --- A lawyer grant needs a named verifier; an application grant is explicit too.
  expect((await grant('police-gulu', { credentialId: firmCred.id, level: 'lawyer' })).body.error).toBe('verification_needed')
  const lawyerGrant = await grant('police-gulu', { credentialId: firmCred.id, level: 'lawyer', verification: 'Uganda Law Society roll check, 2026-11-20', days: 30 })
  expect(lawyerGrant.status).toBe(200)
  let r = await look(firmCred.secret, ask)
  expect(r.body.results[0]).toMatchObject({ audience: 'lawyer', institution: 'Gulu Central Police Station' })
  expect(r.body.results[0].fields).toEqual({ stage: 'Charged', station: 'Desk 7 CID', offence: 'Theft' })
  expect(r.text).not.toContain('Akello')
  expect(r.text).not.toContain('neighbour')
  // The vendor, with no grant of its own, is unaffected by the firm's.
  expect((await look(vendorCred.secret, ask)).body.results[0].audience).toBe('public')

  // --- Cross-institution isolation: the court's grant is the court's to give, over the court's records only.
  await inst('courts', 'records/publish', { jurisdiction: 'UG', recordType: 'criminal_case', referenceKind: 'crb', reference: 'CRB 123/2026', sourceUpdatedAt: now, fields: { stage: 'Hearing set', judge: 'Hon. Justice A' }, fieldPolicy: { stage: 'public', judge: 'institution' } })
  await grant('courts', { credentialId: vendorCred.id, level: 'institution', note: 'registry integration' })
  r = await look(vendorCred.secret, ask)
  const byInstitution = Object.fromEntries(r.body.results.map((x: any) => [x.institution, x]))
  expect(Object.keys(byInstitution).sort()).toEqual(['Gulu Central Police Station', 'Gulu High Court']) // same reference, two issuers: both shown, never merged
  expect(byInstitution['Gulu High Court'].fields.judge).toBe('Hon. Justice A')
  expect(byInstitution['Gulu Central Police Station'].audience).toBe('public') // the court's grant does not reach the police record
  expect(byInstitution['Gulu Central Police Station'].fields).toEqual({ stage: 'Charged' })
  // Narrowing by the issuer's address and by type works; another country's identical number is a different record.
  expect((await look(vendorCred.secret, { ...ask, institution: 'ug.courts.gulu' })).body.count).toBe(1)
  await publish('police-nbi', { jurisdiction: 'KE', fields: { stage: 'Under investigation' }, fieldPolicy: { stage: 'public' } })
  expect((await look(vendorCred.secret, ask)).body.results.some((x: any) => x.jurisdiction === 'KE')).toBe(false)
  expect((await look(vendorCred.secret, { ...ask, jurisdiction: 'KE' })).body.results.map((x: any) => x.institution)).toEqual(['Nairobi Central Police'])
  // Two stations in one country may reuse a number; the caller sees both and can name the one it means.
  await publish('police-lira', { fields: { stage: 'Closed' }, fieldPolicy: { stage: 'public' } })
  expect((await look(vendorCred.secret, ask)).body.count).toBe(3)

  // --- A represented party is tied to ONE record and only after verification.
  const partyCred = await cred('firm', 'application', 'Client portal')
  expect((await grant('police-gulu', { credentialId: partyCred.id, level: 'party', verification: 'Station OC, ID checked' })).body.error).toBe('record_needed')
  expect((await grant('police-gulu', { credentialId: partyCred.id, level: 'party', record: crb })).body.error).toBe('verification_needed')
  expect((await grant('police-gulu', { credentialId: partyCred.id, level: 'party', record: crb, verification: 'Station OC, ID checked' })).status).toBe(200)
  await publish('police-gulu', { reference: 'CRB 124/2026', fields: { stage: 'Open', complainantName: 'Someone Else' }, fieldPolicy: { stage: 'public', complainantName: 'party' } })
  r = await look(partyCred.secret, ask)
  expect(r.body.results.find((x: any) => x.institution.startsWith('Gulu Central')).fields.complainantName).toBe('Akello Grace')
  expect(r.text).not.toContain('Theft') // a party is not a lawyer: audiences are listed per field, not ranked
  const other = await look(partyCred.secret, { ...ask, reference: 'CRB 124/2026' })
  expect(other.text).not.toContain('Someone Else')

  // --- Expiry and revocation take effect on the next call.
  sqlite.run(`UPDATE record_grant SET expires_at = ? WHERE id = ?`, [now - 1000, lawyerGrant.body.id])
  expect((await look(firmCred.secret, ask)).body.results[0].audience).toBe('public')
  const g2 = await grant('police-gulu', { credentialId: firmCred.id, level: 'lawyer', verification: 'ULS roll check', days: 30 })
  expect((await look(firmCred.secret, ask)).body.results[0].audience).toBe('lawyer')
  expect((await inst('police-lira', 'records/grants/revoke', { id: g2.body.id })).status).toBe(404) // not another institution's to revoke
  expect((await inst('police-gulu', 'records/grants/revoke', { id: g2.body.id })).status).toBe(200)
  expect((await look(firmCred.secret, ask)).body.results[0].audience).toBe('public')
  // A revoked or expired credential is the same 401 as a guessed one.
  const dead = await cred('vendor', 'application', 'Retired app')
  expect((await look(dead.secret, ask)).status).toBe(200)
  expect((await inst('firm', 'records/credentials/revoke', { id: dead.id })).status).toBe(404) // only its own institution
  expect((await inst('vendor', 'records/credentials/revoke', { id: dead.id })).status).toBe(200)
  const revoked = await look(dead.secret, ask)
  expect([revoked.status, revoked.body]).toEqual([guessed.status, guessed.body])
  const old = await cred('vendor', 'application', 'Old app')
  sqlite.run(`UPDATE record_credential SET expires_at = ? WHERE id = ?`, [now - 1000, old.id])
  expect((await look(old.secret, ask)).status).toBe(401)

  // --- Sealed, unpublished, unknown and unauthorized all look the same, even to a granted lawyer.
  await grant('police-gulu', { credentialId: firmCred.id, level: 'lawyer', verification: 'ULS roll check' })
  await grant('police-gulu', { credentialId: vendorCred.id, level: 'institution' })
  expect((await inst('police-gulu', 'records/status', { ...crb, status: 'sealed', note: 'court order' })).status).toBe(200)
  const sealed = await look(firmCred.secret, { ...ask, institution: 'ug.police.gulu' })
  const unknown = await look(firmCred.secret, { ...ask, reference: 'CRB 77777/2026', institution: 'ug.police.gulu' })
  expect(sealed.body).toEqual(unknown.body)
  expect(sealed.body).toEqual({ results: [], count: 0 })
  // Even a lawyer-level or party grant cannot read a sealed record; only the institution itself can.
  expect((await look(partyCred.secret, { ...ask, institution: 'ug.police.gulu' })).body.count).toBe(0)
  expect((await look(vendorCred.secret, { ...ask, institution: 'ug.police.gulu' })).body.results[0].status).toBe('sealed')

  // --- Withdrawn, corrected, superseded and stale records say so.
  await publish('police-gulu', { reference: 'CRB 200/2026', fields: { stage: 'Charged' }, fieldPolicy: { stage: 'public' }, sourceUpdatedAt: now - 30 * 86_400_000 })
  await publish('police-gulu', { reference: 'CRB 201/2026', fields: { stage: 'Charged (re-entered)' }, fieldPolicy: { stage: 'public' } })
  const open = { jurisdiction: 'UG', kind: 'crb', institution: 'ug.police.gulu' }
  let s = (await look(firmCred.secret, { ...open, reference: 'CRB 200/2026' })).body.results[0]
  expect(s).toMatchObject({ status: 'published', authority: 'institution_projection' })
  expect(s.freshness).toMatchObject({ stale: true })
  expect(s.freshness.ageHours).toBeGreaterThan(24 * 29)
  expect((await look(firmCred.secret, { ...open, reference: 'CRB 201/2026' })).body.results[0].freshness.stale).toBe(false)
  expect((await inst('police-gulu', 'records/status', { ...crb, reference: 'CRB 200/2026', status: 'superseded' })).body.error).toBe('replacement_needed')
  expect((await inst('police-gulu', 'records/status', { ...crb, reference: 'CRB 200/2026', status: 'superseded', supersededByReference: 'CRB 404/2026' })).body.error).toBe('unknown_replacement')
  expect((await inst('police-gulu', 'records/status', { ...crb, reference: 'CRB 200/2026', status: 'superseded', note: 'Re-registered', supersededByReference: 'CRB 201/2026' })).status).toBe(200)
  s = (await look(firmCred.secret, { ...open, reference: 'CRB 200/2026' })).body.results[0]
  expect(s).toMatchObject({ status: 'superseded', statusNote: 'Re-registered', supersededByReference: 'CRB 201/2026' })
  await inst('police-gulu', 'records/status', { ...crb, reference: 'CRB 201/2026', status: 'withdrawn', note: 'Entered in error' })
  expect((await look(firmCred.secret, { ...open, reference: 'CRB 201/2026' })).body.results[0].status).toBe('withdrawn')
  await publish('police-gulu', { reference: 'CRB 201/2026', fields: { stage: 'Charged (corrected)' }, fieldPolicy: { stage: 'public' }, status: 'corrected', statusNote: 'Stage corrected' })
  s = (await look(firmCred.secret, { ...open, reference: 'CRB 201/2026' })).body.results[0]
  expect(s).toMatchObject({ status: 'corrected', fields: { stage: 'Charged (corrected)' } })

  // --- A reference alone is not enough; bad input is refused before any record is read.
  expect((await look(firmCred.secret, { kind: 'crb', reference: 'CRB 123/2026' })).status).toBe(400)
  expect((await look(firmCred.secret, { jurisdiction: 'UG', reference: 'CRB 123/2026' })).status).toBe(400)

  // --- The institution can read who looked, and what the trail holds is hashes and counts, not content or other institutions' traffic.
  const log = await inst('police-gulu', 'records/access', {})
  expect(log.status).toBe(200)
  expect(log.body.access.length).toBeGreaterThan(5)
  const dump = JSON.stringify(log.body)
  for (const value of ['Theft', 'Akello', 'CRB 123', 'crb-123']) expect(dump).not.toContain(value)
  expect(log.body.access.every((a: any) => !a.referenceHash || /^[0-9a-f]{24}$/.test(a.referenceHash))).toBe(true)
  const courtLog = (await inst('courts', 'records/access', {})).body.access
  expect(courtLog.every((a: any) => a.outcome !== undefined)).toBe(true)
  expect(sqlite.query(`SELECT count(*) n FROM record_access WHERE issuer_organization_id = 'police-lira'`).get()).toEqual({ n: 0 }) // nobody read the Lira record as sole result

  // --- Bulk enumeration: a credential guessing references is stopped at its quota, with the same answer for real and unreal references.
  resetLimiter()
  const guesser = await cred('vendor', 'application', 'Scraper')
  let last = { status: 0 } as any
  for (let i = 0; i < 601; i++) last = await look(guesser.secret, { jurisdiction: 'UG', kind: 'crb', reference: `CRB ${i}/2026` })
  expect(last.status).toBe(429)
  const limitedReal = await look(guesser.secret, ask)
  const limitedFake = await look(guesser.secret, { ...ask, reference: 'CRB 424242/2026' })
  expect([limitedReal.status, limitedReal.body]).toEqual([limitedFake.status, limitedFake.body])
  expect(Number(limitedReal.headers.get('retry-after'))).toBeGreaterThan(0)
  // Another credential, even of the same institution, is not slowed by it.
  expect((await look(vendorCred.secret, ask)).status).toBe(200)
  // Guessing credentials is limited by address and cannot spend a real application's quota.
  for (let i = 0; i < 305; i++) await look('plr_' + String(i).padStart(43, 'B'), ask, '198.51.100.99')
  expect((await look('plr_' + 'C'.repeat(43), ask, '198.51.100.99')).status).toBe(429)
  expect((await look(vendorCred.secret, ask, '198.51.100.99')).status).toBe(200)

  // --- Read-only for callers.
  const post = await handleRecordsV1(new Request('http://localhost/api/records/v1/records', { method: 'POST', headers: { authorization: `Bearer ${firmCred.secret}` } }), 'records')
  expect(post.status).toBe(405)
  console.warn = warn
})
