import { expect, mock, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { env as cfEnv } from './helpers/cf-env'
import { hitWindow, type WindowState } from '../src/lib/quota-window'
import { PleadliRecords } from '../../docs/platform/examples/records-client'

/** Who may publish, approve, revoke and administer credentials, and what stops a stolen computer, a label, a stale
 * grant or a tightened policy from disclosing anything. Plus one real publisher and one external TypeScript consumer. */

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')

test('records authority: a licensed computer alone does nothing, an officer does only what they are permitted, and the policy bounds what can ever be shown', async () => {
  const sqlite = new Database(':memory:')
  for (const dir of readdirSync(new URL('../.migrations/', import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../.migrations/${dir}/migration.sql`, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''))
  mock.module('../src/db', () => ({ db: drizzle({ client: sqlite }) }))
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  for (const k of Object.keys(cfEnv)) delete cfEnv[k]
  Object.assign(cfEnv, { BETTER_AUTH_URL: 'http://localhost:3000', ORCHESTRA_SIGNING_KEY: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)))) })
  const counters = new Map<string, WindowState>()
  let counterDown = false
  cfEnv.QUOTA = {
    idFromName: (n: string) => n,
    get: (n: string) => ({
      hit: async (limit: number, windowMs: number) => {
        if (counterDown) throw new Error('Durable Object unavailable')
        const r = hitWindow(counters.get(n), limit, windowMs, Date.now())
        counters.set(n, r.state)
        return r.verdict
      },
    }),
  }
  mock.module('cloudflare:workers', () => ({ env: cfEnv }))
  const warn = console.warn
  const error = console.error
  console.warn = () => {}

  const now = Date.now()
  const orgs: [string, string, string, string][] = [
    ['police', 'Gulu Central Police Station', 'police', 'ug.police.gulu'],
    ['other', 'Lira Police Station', 'police', 'ug.police.lira'],
    ['firm', 'Okello and Co Advocates', 'lawyers', 'ug.lawyers.okello'],
  ]
  const devices: Record<string, string> = {}
  for (const [id, name, type, address] of orgs) {
    sqlite.run(`INSERT INTO organization (id,name,slug,institution_type,kind,country,status,address,requested_at) VALUES (?,?,?,?,?,?,?,?,?)`, [id, name, id, type, 'institution', 'UG', 'active', address, now])
    sqlite.run(`INSERT INTO licence (id,organization_id,application,seats,starts_at,expires_at,status,key_hash,key_hint,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [`l-${id}`, id, type, 5, now - 1000, now + 86_400_000, 'active', `l-${id}`, 'TEST', now])
    devices[id] = await hex(`device-${id}`)
    sqlite.run(`INSERT INTO computer (id,device_hash,application,organization_id,unit_id,licence_id,version,os,trial_started_at,first_seen_at,last_seen_at,token_hash,seal_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [`pc-${id}`, devices[id], type, id, null, `l-${id}`, '1', 'linux', now, now, now, await hex(`token-pc-${id}`), 'k'])
  }
  // A second computer of the police station: the same institution, another machine.
  const device2 = await hex('device-police-2')
  sqlite.run(`INSERT INTO computer (id,device_hash,application,organization_id,unit_id,licence_id,version,os,trial_started_at,first_seen_at,last_seen_at,token_hash,seal_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, ['pc-police-2', device2, 'police', 'police', null, 'l-police', '1', 'linux', now, now, now, await hex('token-pc-police-2'), 'k'])
  const app = (id: string) => orgs.find((o) => o[0] === id)![2]

  const { handleOrchestraV1 } = await import('../src/api/orchestra-v1')
  const { handleRecordsV1 } = await import('../src/lib/records.server')
  const { createOfficer, revokeOfficer } = await import('../src/lib/records-authority.server')

  /** One call to an institution-side endpoint: which computer, and (optionally) which officer's secret. */
  const call = async (as: { org: string; computer?: string; officer?: string }, path: string, body: object = {}) => {
    const computerId = as.computer ?? as.org
    const dev = as.computer === 'police-2' ? device2 : devices[as.org]
    const headers: Record<string, string> = { authorization: `Bearer token-pc-${computerId === as.org ? as.org : 'police-2'}`, 'content-type': 'application/json' }
    if (as.officer) headers['x-officer-token'] = as.officer
    const r = await handleOrchestraV1(new Request(`http://localhost/api/orchestra/v1/${path}`, { method: 'POST', headers, body: JSON.stringify({ device: dev, application: app(as.org), ...body }) }), path)
    return { status: r.status, body: (await r.json()) as any }
  }
  const owner = 'owner-user-1'
  const officer = (org: string, permissions: string[], extra: Record<string, unknown> = {}) => createOfficer({ organizationId: org, name: `Officer ${permissions.join('+')}`, permissions: permissions as never, days: 30, createdBy: owner, ...extra })

  const crb = { jurisdiction: 'UG', recordType: 'criminal_case', referenceKind: 'crb', reference: 'CRB 500/2026' }
  const publishBody = { ...crb, sourceUpdatedAt: now - 3_600_000, fields: { stage: 'Charged', offence: 'Theft', complainantName: 'Akello Grace', investigatorNote: 'Informant is a neighbour' }, fieldPolicy: { stage: 'public', offence: ['lawyer', 'institution'], complainantName: ['party', 'institution'], investigatorNote: 'institution' } }
  const setPolicy = (org: string, allowed: Record<string, string[]>, enabled = true) => {
    sqlite.run(`DELETE FROM record_policy WHERE organization_id = ?`, [org])
    sqlite.run(`INSERT INTO record_policy (id,organization_id,jurisdiction,record_type,reference_kind,allowed,enabled,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), org, 'UG', 'criminal_case', 'crb', JSON.stringify(allowed), enabled ? 1 : 0, owner, now])
  }
  const countRows = (table: string) => (sqlite.query(`SELECT count(*) n FROM ${table}`).get() as { n: number }).n

  // --- 1. A licensed computer, however valid, is not an officer: nothing sensitive happens without one.
  setPolicy('police', { stage: ['public', 'lawyer'], offence: ['lawyer', 'institution'], complainantName: ['party', 'institution'], investigatorNote: ['institution'] })
  for (const [path, body] of [['records/publish', publishBody], ['records/credentials', { name: 'App', kind: 'application' }], ['records/grants', { credentialId: crypto.randomUUID(), level: 'application' }], ['records/grants/revoke', { id: crypto.randomUUID() }], ['records/credentials/revoke', { id: crypto.randomUUID() }], ['records/access', {}], ['records/status', { ...crb, status: 'sealed' }]] as const) {
    const r = await call({ org: 'police' }, path, body)
    expect([path, r.status, r.body.error]).toEqual([path, 403, 'officer_needed'])
  }
  expect([countRows('record_projection'), countRows('record_credential'), countRows('record_grant')]).toEqual([0, 0, 0])
  // A body field or a made-up header cannot stand in for the officer's secret.
  expect((await call({ org: 'police' }, 'records/publish', { ...publishBody, officer: 'x', officerToken: 'pro_' + 'A'.repeat(43) })).body.error).toBe('officer_needed')
  expect((await call({ org: 'police', officer: 'pro_' + 'A'.repeat(43) }, 'records/publish', publishBody)).body.error).toBe('officer_needed')

  // --- 2. Each permission is separate.
  const publisher = await officer('police', ['publish'])
  const approver = await officer('police', ['approve'])
  const revoker = await officer('police', ['revoke'])
  const credentialAdmin = await officer('police', ['credentials'])
  const auditor = await officer('police', ['audit'])
  expect((await call({ org: 'police', officer: publisher.secret }, 'records/publish', publishBody)).status).toBe(200)
  const mine = await call({ org: 'police', officer: credentialAdmin.secret }, 'records/credentials', { name: 'Case app', kind: 'application' })
  expect(mine.status).toBe(200)
  const lawyerCred = (await call({ org: 'firm', officer: (await officer('firm', ['credentials'])).secret }, 'records/credentials', { name: 'A. Okello (advocate)', kind: 'lawyer' })).body as { id: string; secret: string }
  const denied: [string, string, object][] = [
    [publisher.secret, 'records/grants', { credentialId: lawyerCred.id, level: 'application' }], // publish is not approve
    [publisher.secret, 'records/credentials', { name: 'Another app', kind: 'application' }],
    [approver.secret, 'records/publish', publishBody],
    [approver.secret, 'records/grants/revoke', { id: crypto.randomUUID() }],
    [revoker.secret, 'records/grants', { credentialId: lawyerCred.id, level: 'application' }],
    [credentialAdmin.secret, 'records/publish', publishBody],
    [credentialAdmin.secret, 'records/grants', { credentialId: lawyerCred.id, level: 'application' }],
    [auditor.secret, 'records/publish', publishBody],
    [publisher.secret, 'records/access', {}],
  ]
  for (const [secret, path, body] of denied) {
    const r = await call({ org: 'police', officer: secret }, path, body)
    expect([path, r.status, r.body.error]).toEqual([path, 403, 'not_permitted'])
  }
  expect(countRows('record_grant')).toBe(0)
  expect((await call({ org: 'police', officer: auditor.secret }, 'records/access', {})).status).toBe(200)

  // --- 3. An officer's secret is bound to its institution, its computer, its expiry and its revocation.
  const firmOfficer = await officer('firm', ['publish'])
  expect((await call({ org: 'police', officer: firmOfficer.secret }, 'records/publish', publishBody)).body.error).toBe('officer_needed') // another institution's officer
  const bound = await officer('police', ['publish'], { computerId: 'pc-police' })
  expect((await call({ org: 'police', officer: bound.secret }, 'records/publish', publishBody)).status).toBe(200)
  expect((await call({ org: 'police', computer: 'police-2', officer: bound.secret }, 'records/publish', publishBody)).body.error).toBe('officer_needed') // stolen secret, wrong machine
  const shortLived = await officer('police', ['publish'])
  sqlite.run(`UPDATE record_officer SET expires_at = ? WHERE id = ?`, [now - 1000, shortLived.id])
  expect((await call({ org: 'police', officer: shortLived.secret }, 'records/publish', publishBody)).body.error).toBe('officer_needed')
  const leaver = await officer('police', ['publish'])
  expect((await call({ org: 'police', officer: leaver.secret }, 'records/publish', publishBody)).status).toBe(200)
  expect(await revokeOfficer('other', leaver.id, owner)).toBe(false) // another institution's owner cannot revoke it
  expect(await revokeOfficer('police', leaver.id, owner)).toBe(true)
  expect((await call({ org: 'police', officer: leaver.secret }, 'records/publish', publishBody)).body.error).toBe('officer_needed')
  // Only a hash is stored.
  expect((sqlite.query(`SELECT count(*) n FROM record_officer WHERE secret_hash = ?`).get(leaver.secret) as { n: number }).n).toBe(0)

  // --- 4. The policy bounds what may ever be published. There is no default.
  const asPublisher = { org: 'police', officer: publisher.secret }
  expect((await call({ org: 'other', officer: (await officer('other', ['publish'])).secret }, 'records/publish', publishBody)).body.error).toBe('not_permitted_by_policy') // no policy at all
  const beyond = await call(asPublisher, 'records/publish', { ...publishBody, reference: 'CRB 501/2026', fieldPolicy: { ...publishBody.fieldPolicy, stage: 'application' } })
  expect([beyond.status, beyond.body.error]).toEqual([403, 'not_permitted_by_policy'])
  expect(beyond.body.message).toContain('stage')
  const unlisted = await call(asPublisher, 'records/publish', { ...publishBody, reference: 'CRB 502/2026', fields: { ...publishBody.fields, homeAddress: 'Plot 4' }, fieldPolicy: { ...publishBody.fieldPolicy, homeAddress: 'public' } })
  expect([unlisted.status, unlisted.body.error]).toEqual([403, 'not_permitted_by_policy'])
  expect(sqlite.query(`SELECT count(*) n FROM record_projection WHERE reference IN ('CRB/501/2026','CRB/502/2026')`).get()).toEqual({ n: 0 })

  // --- 5. A lawyer's access is a verified, recorded, expiring grant, never a label.
  const approve = { org: 'police', officer: approver.secret }
  const noCheck = await call(approve, 'records/grants', { credentialId: lawyerCred.id, level: 'lawyer' })
  expect([noCheck.status, noCheck.body.error]).toEqual([422, 'verification_needed'])
  const look = async (secret: string | null, reference = 'CRB 500/2026') => {
    const url = new URL('http://localhost/api/records/v1/records')
    for (const [k, v] of Object.entries({ jurisdiction: 'UG', kind: 'crb', reference })) url.searchParams.set(k, v)
    const r = await handleRecordsV1(new Request(url, { headers: { 'cf-connecting-ip': '203.0.113.9', ...(secret ? { authorization: `Bearer ${secret}` } : {}) } }), 'records')
    const text = await r.text()
    return { status: r.status, body: JSON.parse(text) as any, text }
  }
  expect((await look(lawyerCred.secret)).body.results[0].audience).toBe('public') // calling itself "lawyer" gave nothing
  // The claim of who verified is the officer's, taken from the secret; a name in the body does not replace it.
  const granted = await call(approve, 'records/grants', { credentialId: lawyerCred.id, level: 'lawyer', verification: 'ULS roll and practising certificate checked', verifiedBy: 'The Director General', days: 30 })
  expect(granted.status).toBe(200)
  const stored = sqlite.query(`SELECT verified_by FROM record_grant WHERE id = ?`).get(granted.body.id) as { verified_by: string }
  expect(stored.verified_by).toContain(`Officer approve`)
  expect(stored.verified_by).not.toContain('Director General')
  let shown = await look(lawyerCred.secret)
  expect(shown.body.results[0]).toMatchObject({ audience: 'lawyer' })
  expect(shown.body.results[0].fields).toEqual({ stage: 'Charged', offence: 'Theft' })
  // Indirect disclosure: not in the serialised response, in any form.
  for (const hidden of ['Akello', 'neighbour', 'complainantName', 'investigatorNote']) expect(shown.text).not.toContain(hidden)
  // Cross-institution: this grant is the police station's to give over the police station's records only.
  sqlite.run(`INSERT INTO record_projection (id,organization_id,jurisdiction,record_type,reference_kind,reference,display_reference,status,fields,field_policy,version,source_updated_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), 'other', 'UG', 'criminal_case', 'crb', 'CRB/500/2026', 'CRB 500/2026', 'published', JSON.stringify({ stage: 'Open', offence: 'Fraud' }), JSON.stringify({ stage: 'public', offence: 'lawyer' }), 1, now, now])
  setPolicy('other', { stage: ['public'], offence: ['lawyer'] })
  const both = await look(lawyerCred.secret)
  const lira = both.body.results.find((r: any) => r.institution === 'Lira Police Station')
  expect(lira.audience).toBe('public')
  expect(both.text).not.toContain('Fraud') // the Gulu grant does not open Lira's record
  // Guessing: a nearby reference, or one in another kind, gives the same empty answer as a real protected one.
  expect((await look(lawyerCred.secret, 'CRB 501/2026')).body).toEqual({ results: [], count: 0 })

  // --- 6. Stale grants and revoked credentials stop at once; a revoked credential cannot be granted anything.
  const g = await call({ org: 'police', officer: revoker.secret }, 'records/grants/revoke', { id: granted.body.id })
  expect(g.status).toBe(200)
  expect((await look(lawyerCred.secret)).body.results[0].audience).toBe('public')
  const g2 = await call(approve, 'records/grants', { credentialId: lawyerCred.id, level: 'lawyer', verification: 'ULS roll checked again', days: 30 })
  sqlite.run(`UPDATE record_grant SET expires_at = ? WHERE id = ?`, [now - 1000, g2.body.id])
  expect((await look(lawyerCred.secret)).body.results[0].audience).toBe('public') // expired
  const g3 = await call(approve, 'records/grants', { credentialId: lawyerCred.id, level: 'lawyer', verification: 'ULS roll checked', days: 30 })
  expect((await look(lawyerCred.secret)).body.results[0].audience).toBe('lawyer')
  await call({ org: 'firm', officer: (await officer('firm', ['credentials'])).secret }, 'records/credentials/revoke', { id: lawyerCred.id })
  expect((await look(lawyerCred.secret)).status).toBe(401)
  const revokedTarget = await call(approve, 'records/grants', { credentialId: lawyerCred.id, level: 'lawyer', verification: 'x y z' })
  expect([revokedTarget.status, revokedTarget.body.error]).toEqual([404, 'unknown_credential'])
  void g3

  // --- 7. Tightening or disabling the policy stops disclosure of what was already published.
  const secondCred = (await call({ org: 'firm', officer: (await officer('firm', ['credentials'])).secret }, 'records/credentials', { name: 'Second advocate', kind: 'lawyer' })).body as { id: string; secret: string }
  await call(approve, 'records/grants', { credentialId: secondCred.id, level: 'lawyer', verification: 'ULS roll checked', days: 30 })
  expect((await look(secondCred.secret)).body.results[0].fields).toEqual({ stage: 'Charged', offence: 'Theft' })
  setPolicy('police', { stage: ['public', 'lawyer'], offence: ['institution'], complainantName: ['party', 'institution'], investigatorNote: ['institution'] }) // offence no longer for lawyers
  expect((await look(secondCred.secret)).body.results.find((r: any) => r.institution.startsWith('Gulu')).fields).toEqual({ stage: 'Charged' })
  setPolicy('police', { stage: ['public'] }, false) // disabled
  expect((await look(secondCred.secret)).body.results.some((r: any) => r.institution.startsWith('Gulu'))).toBe(false)
  setPolicy('police', { stage: ['public', 'lawyer'], offence: ['lawyer', 'institution'], complainantName: ['party', 'institution'], investigatorNote: ['institution'] })

  // --- 8. The real publisher and an external TypeScript consumer, end to end, on synthetic data.
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    return handleRecordsV1(new Request(url, { ...init, headers: { 'cf-connecting-ip': '203.0.113.77', ...(init?.headers as Record<string, string>) } }), url.pathname.replace('/api/records/v1/', ''))
  }) as typeof fetch
  try {
    const synthetic = { ...crb, reference: 'CRB 9001/2026', sourceUpdatedAt: now, fields: { stage: 'Plea taken', hearingDate: '2026-12-01', accusedName: 'Synthetic Person', witnessList: 'W1, W2' }, fieldPolicy: { stage: 'public', hearingDate: ['lawyer', 'institution'], accusedName: ['party', 'institution'], witnessList: 'institution' } }
    setPolicy('police', { stage: ['public', 'lawyer'], hearingDate: ['lawyer', 'institution'], accusedName: ['party', 'institution'], witnessList: ['institution'] })
    expect((await call(asPublisher, 'records/publish', synthetic)).status).toBe(200)
    const external = (await call({ org: 'firm', officer: (await officer('firm', ['credentials'])).secret }, 'records/credentials', { name: 'External case app', kind: 'application' })).body as { id: string; secret: string }
    const client = new PleadliRecords(external.secret, 'https://pleadli.test')
    const publicOnly = await client.lookup({ jurisdiction: 'UG', kind: 'crb', reference: 'crb-9001-2026' })
    expect(publicOnly.results[0].fields).toEqual({ stage: 'Plea taken' })
    await call(approve, 'records/grants', { credentialId: external.id, level: 'lawyer', verification: 'Practising certificate 2026 seen', days: 30 })
    const verified = await new PleadliRecords(external.secret, 'https://pleadli.test').lookup({ jurisdiction: 'UG', kind: 'crb', reference: 'CRB 9001/2026' })
    expect(verified.results[0].fields).toEqual({ stage: 'Plea taken', hearingDate: '2026-12-01' })
    const wire = JSON.stringify(verified)
    for (const restricted of ['Synthetic Person', 'accusedName', 'W1, W2', 'witnessList']) expect(wire).not.toContain(restricted)
    // A fault in the quota service is a 503 to the consumer, with nothing read.
    counterDown = true
    console.error = () => {}
    await expect(new PleadliRecords(external.secret, 'https://pleadli.test').lookup({ jurisdiction: 'UG', kind: 'crb', reference: 'CRB 9001/2026' })).rejects.toMatchObject({ status: 503, code: 'service_unavailable' })
    counterDown = false
  } finally {
    globalThis.fetch = realFetch
  }

  // --- 9. With the counter down, officer operations change nothing.
  const before = [countRows('record_grant'), countRows('record_credential'), countRows('record_projection')]
  counterDown = true
  console.error = () => {}
  for (const [secret, path, body] of [[approver.secret, 'records/grants', { credentialId: secondCred.id, level: 'application' }], [credentialAdmin.secret, 'records/credentials', { name: 'During outage', kind: 'application' }], [publisher.secret, 'records/publish', { ...publishBody, reference: 'CRB 600/2026' }]] as const) {
    const r = await call({ org: 'police', officer: secret }, path, body)
    expect([path, r.status, r.body.error]).toEqual([path, 503, 'service_unavailable'])
  }
  counterDown = false
  expect([countRows('record_grant'), countRows('record_credential'), countRows('record_projection')]).toEqual(before)

  // --- 10. Every sensitive action is on the institution's admin trail, under the officer's name, without record values.
  const trail = sqlite.query(`SELECT actor, actor_name, action, detail FROM record_admin_event WHERE organization_id = 'police'`).all() as { actor: string; actor_name: string | null; action: string; detail: string | null }[]
  const actions = new Set(trail.map((t) => t.action))
  for (const expected of ['record_published', 'grant_approved', 'grant_revoked', 'officer_authorised', 'officer_revoked']) expect(actions.has(expected)).toBe(true)
  expect(trail.some((t) => t.actor.startsWith('officer:') && t.actor_name?.startsWith('Officer '))).toBe(true)
  const dump = JSON.stringify(trail)
  for (const value of ['Theft', 'Akello', 'Synthetic Person', 'neighbour']) expect(dump).not.toContain(value)

  console.warn = warn
  console.error = error
})
