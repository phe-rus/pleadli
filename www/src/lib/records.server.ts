import { db } from '@/db'
import { organization } from '@/db/auth-schema'
import { recordAccess, recordCredential, recordGrant, recordProjection } from '@/db/records-schema'
import { bearerToken, sha256Of } from '@/lib/computer-auth.server'
import { limitAnonymous, limitAuthenticated, type Quota } from '@/lib/quota.server'
import { policyFor } from '@/lib/records-authority.server'
import { and, eq } from 'drizzle-orm'

/** The institution-controlled records API: who may see which field of which record.
 * Rules, in the order they are applied (docs/platform/RECORDS-API.md):
 *  1. The caller proves a credential (revoked, expired and unknown look the same).
 *  2. The quota is charged to that verified credential and its institution.
 *  3. A record is found by issuer, jurisdiction, kind and reference, never by a bare number.
 *  4. The caller's audience for each record comes ONLY from grants the issuing institution made, and it
 *     starts at "public". A credential's own label ("lawyer") and being registered add nothing.
 *  5. Audiences are NOT a ladder: a party is not "above" a lawyer. Each field lists the exact audiences it is for
 *     ("public" means anyone), and a caller sees it only if one of the levels granted to them for that record is listed.
 *  6. Fields are chosen on the server. A field the audience may not see is not in the response at all.
 *  7. Unknown, unpublished, sealed-to-you and not-yours all give the same empty answer.
 *  8. The access is written to the audit trail, by hash of the reference, never with a field value. */

export const AUDIENCES = ['public', 'application', 'lawyer', 'party', 'institution'] as const
export type Audience = (typeof AUDIENCES)[number]
export const rank = (a: Audience) => AUDIENCES.indexOf(a)
export const STATUSES = ['published', 'withdrawn', 'corrected', 'superseded', 'sealed'] as const
export type RecordStatus = (typeof STATUSES)[number]
/** A projection older than this at the source may be out of date, and says so. */
export const STALE_AFTER_MS = 7 * 86_400_000

/** "CRB 123/2026", "crb-123-2026" and "CRB.123.2026" are one reference; the slash keeps groups apart. */
export function normaliseReference(text: string) {
  return text.toUpperCase().replace(/[\s\-_.\\/]+/g, '/').replace(/^\/|\/$/g, '')
}

export async function hashReference(text: string) {
  return (await sha256Of(new TextEncoder().encode(normaliseReference(text)))).slice(0, 24)
}

export type Credential = { id: string; organizationId: string; kind: string }

/** Null for a missing, unknown, revoked or expired credential: the caller cannot tell which. */
export async function authenticate(request: Request): Promise<Credential | null> {
  const token = bearerToken(request)
  if (!token.startsWith('plr_') || token.length < 20 || token.length > 120) return null
  const [row] = await db
    .select({ c: recordCredential, status: organization.status })
    .from(recordCredential)
    .innerJoin(organization, eq(organization.id, recordCredential.organizationId))
    .where(eq(recordCredential.secretHash, await sha256Of(new TextEncoder().encode(token))))
  if (!row || row.c.revokedAt || row.c.expiresAt <= new Date() || row.status !== 'active') return null
  await db.update(recordCredential).set({ lastUsedAt: new Date() }).where(eq(recordCredential.id, row.c.id))
  return { id: row.c.id, organizationId: row.c.organizationId, kind: row.c.kind }
}

type Grant = typeof recordGrant.$inferSelect
type Projection = typeof recordProjection.$inferSelect

/** The grants that are in force now. A lawyer or party grant that was never verified, or a party grant not tied to one record, counts for nothing. */
async function activeGrants(credentialId: string, now: Date): Promise<Grant[]> {
  const rows = await db.select().from(recordGrant).where(eq(recordGrant.credentialId, credentialId))
  return rows.filter((g) => {
    if (g.revokedAt || g.expiresAt <= now) return false
    if ((g.level === 'lawyer' || g.level === 'party') && (!g.verifiedBy || !g.verifiedAt)) return false
    if (g.level === 'party' && !g.projectionId) return false
    return (AUDIENCES as readonly string[]).includes(g.level)
  })
}

/** Every level this caller holds for this record, always including "public". */
export function audiencesFor(projection: Projection, grants: Grant[]): Audience[] {
  const held = new Set<Audience>(['public'])
  for (const g of grants) {
    if (g.issuerOrganizationId !== projection.organizationId) continue // another institution's grant never reaches this record
    if (g.recordType && g.recordType !== projection.recordType) continue
    if (g.projectionId && g.projectionId !== projection.id) continue
    held.add(g.level as Audience)
  }
  return [...held]
}

const highest = (held: Audience[]) => held.reduce((a, b) => (rank(b) > rank(a) ? b : a), 'public' as Audience)

function parseObject(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

export type DisclosedRecord = {
  institution: string
  jurisdiction: string
  recordType: string
  referenceKind: string
  reference: string
  status: RecordStatus
  statusNote: string | null
  supersededByReference: string | null
  /** The most trusted level this caller holds for the record, and every level it holds. */
  audience: Audience
  audiences: Audience[]
  fields: Record<string, unknown>
  freshness: { sourceUpdatedAt: number; projectedAt: number; ageHours: number; stale: boolean }
  /** The projection is what the institution sent; the institution's own records stay authoritative. */
  authority: 'institution_projection'
}

/** What one audience may see of one projection, or null when it may see nothing (then it is not a result at all). */
export function disclose(p: Projection, held: Audience[], issuer: string, now: number, ceiling?: Record<string, string[]>): DisclosedRecord | null {
  // A sealed record is for the institution itself and nobody else, whatever a field's policy says.
  if (p.status === 'sealed' && !held.includes('institution')) return null
  const values = parseObject(p.fields)
  const policy = parseObject(p.fieldPolicy)
  const fields: Record<string, unknown> = {}
  for (const [name, allowedRaw] of Object.entries(policy)) {
    if (!(name in values)) continue
    // The institution's current policy is a ceiling: a field the policy no longer lists, or an audience it no longer allows, is
    // not disclosed even if it was published earlier.
    const limit = ceiling?.[name]
    if (ceiling && !limit) continue
    const allowed = (Array.isArray(allowedRaw) ? allowedRaw : [allowedRaw]).filter((a): a is Audience => (AUDIENCES as readonly string[]).includes(a as string) && (!limit || limit.includes(a)))
    // An unreadable policy lists no audience and so discloses nothing.
    if (allowed.includes('public') || allowed.some((a) => held.includes(a))) fields[name] = values[name]
  }
  if (!Object.keys(fields).length) return null
  const source = p.sourceUpdatedAt.getTime()
  return {
    institution: issuer,
    jurisdiction: p.jurisdiction,
    recordType: p.recordType,
    referenceKind: p.referenceKind,
    reference: p.displayReference,
    status: p.status as RecordStatus,
    statusNote: p.statusNote,
    supersededByReference: p.supersededByReference,
    audience: highest(held),
    audiences: held,
    fields,
    freshness: { sourceUpdatedAt: source, projectedAt: p.updatedAt.getTime(), ageHours: Math.floor((now - source) / 3_600_000), stale: now - source > STALE_AFTER_MS },
    authority: 'institution_projection',
  }
}

export type Query = { jurisdiction: string; referenceKind: string; reference: string; recordType?: string; institution?: string }

export async function resolve(credential: Credential, query: Query, now = new Date()) {
  const rows = await db
    .select({ p: recordProjection, issuer: organization.name, address: organization.address })
    .from(recordProjection)
    .innerJoin(organization, eq(organization.id, recordProjection.organizationId))
    .where(and(eq(recordProjection.jurisdiction, query.jurisdiction), eq(recordProjection.referenceKind, query.referenceKind), eq(recordProjection.reference, normaliseReference(query.reference))))
  const grants = await activeGrants(credential.id, now)
  const results: DisclosedRecord[] = []
  let issuerOrganizationId: string | null = null
  for (const row of rows) {
    if (query.recordType && row.p.recordType !== query.recordType) continue
    if (query.institution && row.address !== query.institution) continue
    // No enabled policy now means nothing of this record is disclosed, whatever was projected before.
    const policy = await policyFor(row.p.organizationId, row.p)
    if (!policy || !policy.enabled) continue
    let ceiling: Record<string, string[]> | undefined
    try {
      ceiling = JSON.parse(policy.allowed)
    } catch {
      continue
    }
    const shown = disclose(row.p, audiencesFor(row.p, grants), row.issuer, now.getTime(), ceiling)
    if (shown) {
      results.push(shown)
      issuerOrganizationId = results.length === 1 ? row.p.organizationId : null
    }
  }
  return { results, issuerOrganizationId }
}

async function audit(entry: Omit<typeof recordAccess.$inferInsert, 'id' | 'at'>) {
  await db.insert(recordAccess).values({ id: crypto.randomUUID(), at: new Date(), ...entry })
}

const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } })

const tooMany = (q: Extract<Quota, { ok: false }>) => json({ error: q.unavailable ? 'service_unavailable' : 'too_many_requests', retryAfter: q.retryAfter }, q.unavailable ? 503 : 429, { 'retry-after': String(q.retryAfter) })

/** GET /api/records/v1/records?jurisdiction=UG&kind=crb&reference=...&type=&institution= */
export async function handleRecordsV1(request: Request, path: string): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'authorization' } })
  if (path.replace(/^\/+|\/+$/g, '') !== 'records') return json({ error: 'not_found' }, 404)
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)

  // 1. Who is asking. Bad credentials are limited by address, so guessing them is slow and cannot spend a real application's quota.
  const credential = await authenticate(request)
  if (!credential) {
    const quota = await limitAnonymous(request)
    return quota.ok ? json({ error: 'unauthorized' }, 401, { 'www-authenticate': 'Bearer' }) : tooMany(quota)
  }
  // 2. The quota is charged to the verified credential and institution before any record is read.
  const quota = await limitAuthenticated({ credentialId: credential.id, organizationId: credential.organizationId })
  if (!quota.ok) {
    await audit({ credentialId: credential.id, callerOrganizationId: credential.organizationId, outcome: quota.unavailable ? 'refused' : 'limited' })
    return tooMany(quota)
  }
  // 3. What is being asked.
  const url = new URL(request.url).searchParams
  const jurisdiction = (url.get('jurisdiction') ?? '').toUpperCase()
  const referenceKind = (url.get('kind') ?? '').toLowerCase()
  const reference = url.get('reference') ?? ''
  const recordType = url.get('type')?.toLowerCase() || undefined
  const institution = url.get('institution')?.toLowerCase() || undefined
  if (!/^[A-Z]{2}$/.test(jurisdiction) || !/^[a-z0-9_]{2,40}$/.test(referenceKind) || normaliseReference(reference).length < 3 || reference.length > 80) {
    return json({ error: 'invalid', message: 'jurisdiction (two letters), kind and reference are all needed. A reference alone does not identify a record.' }, 400)
  }
  // 4 to 6. Find, decide the audience, filter fields.
  const { results, issuerOrganizationId } = await resolve(credential, { jurisdiction, referenceKind, reference, recordType, institution })
  // 7. Audit before answering: if the trail cannot be written, nothing is returned.
  await audit({
    credentialId: credential.id,
    callerOrganizationId: credential.organizationId,
    issuerOrganizationId,
    outcome: results.length ? 'found' : 'none',
    audience: results.length === 1 ? results[0].audience : null,
    referenceHash: await hashReference(reference),
    fieldsReturned: results.reduce((n, r) => n + Object.keys(r.fields).length, 0),
  })
  return json({ results, count: results.length })
}
