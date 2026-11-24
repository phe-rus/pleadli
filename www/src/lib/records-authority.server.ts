import { db } from '@/db'
import { recordAdminEvent, recordOfficer, recordPolicy } from '@/db/records-schema'
import { b64url } from '@/lib/orchestra-signing'
import { sha256Of } from '@/lib/computer-auth.server'
import { and, desc, eq } from 'drizzle-orm'

/** Who may do the sensitive things in the records API, kept apart on purpose (docs/platform/RECORDS-API.md):
 *
 *  - the LICENSED COMPUTER says which machine is calling (it proves a licence, nothing more);
 *  - the OFFICER is a named person at the institution, authorised by an institution OWNER on the web, who holds a secret
 *    of their own (never shown again, only its hash is kept, expires, revocable, optionally tied to one computer);
 *  - the OFFICER'S PERMISSIONS say what that person may do: publish, approve access, revoke access, administer
 *    application credentials, read the access audit. Each is separate;
 *  - the POLICY (set by an owner on the web) says what the institution may publish at all.
 *
 * None of these can be forged by a client: a computer's token, a body field or a label cannot stand in for an officer's
 * secret, and an officer's secret cannot reach beyond its own institution or its permissions. */

export const PERMISSIONS = ['publish', 'approve', 'revoke', 'credentials', 'audit'] as const
export type Permission = (typeof PERMISSIONS)[number]

export const OFFICER_HEADER = 'x-officer-token'

export type Officer = { id: string; organizationId: string; name: string; permissions: Permission[] }

export type Refusal = { status: number; code: string; message: string }

const parsePermissions = (text: string): Permission[] => {
  try {
    const list = JSON.parse(text)
    return Array.isArray(list) ? list.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)) : []
  } catch {
    return []
  }
}

/** The officer behind this request for this institution and computer holding this permission, or the refusal.
 * An unknown, revoked, expired, other-institution or other-computer secret all answer the same. */
export async function authoriseOfficer(request: Request, organizationId: string, computerId: string, needed: Permission): Promise<{ officer: Officer } | { refusal: Refusal }> {
  const refuse = { refusal: { status: 403, code: 'officer_needed', message: 'This needs an authorised officer of the institution, not only a licensed computer. Send the officer’s own secret.' } }
  const secret = request.headers.get(OFFICER_HEADER) ?? ''
  if (!secret.startsWith('pro_') || secret.length < 20 || secret.length > 120) return refuse
  const [row] = await db.select().from(recordOfficer).where(eq(recordOfficer.secretHash, await sha256Of(new TextEncoder().encode(secret))))
  if (!row || row.organizationId !== organizationId || row.revokedAt || row.expiresAt <= new Date()) return refuse
  if (row.computerId && row.computerId !== computerId) return refuse
  const permissions = parsePermissions(row.permissions)
  if (!permissions.includes(needed)) return { refusal: { status: 403, code: 'not_permitted', message: `${row.name} is not authorised to do this (needs: ${needed}).` } }
  await db.update(recordOfficer).set({ lastUsedAt: new Date() }).where(eq(recordOfficer.id, row.id))
  return { officer: { id: row.id, organizationId: row.organizationId, name: row.name, permissions } }
}

/** An owner authorises a person. The secret is returned once. */
export async function createOfficer(input: { organizationId: string; name: string; title?: string | null; permissions: Permission[]; computerId?: string | null; days: number; createdBy: string }) {
  const secret = `pro_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`
  const id = crypto.randomUUID()
  const at = new Date()
  await db.insert(recordOfficer).values({
    id,
    organizationId: input.organizationId,
    name: input.name,
    title: input.title ?? null,
    permissions: JSON.stringify([...new Set(input.permissions)]),
    computerId: input.computerId ?? null,
    secretHash: await sha256Of(new TextEncoder().encode(secret)),
    hint: secret.slice(-4),
    createdBy: input.createdBy,
    createdAt: at,
    expiresAt: new Date(at.getTime() + input.days * 86_400_000),
  })
  await adminEvent({ organizationId: input.organizationId, actor: `user:${input.createdBy}`, action: 'officer_authorised', subject: id, detail: `${input.name}: ${[...new Set(input.permissions)].join(', ')}; ${input.days} days` })
  return { id, secret }
}

export async function revokeOfficer(organizationId: string, id: string, by: string) {
  const [found] = await db.select({ id: recordOfficer.id, name: recordOfficer.name }).from(recordOfficer).where(and(eq(recordOfficer.id, id), eq(recordOfficer.organizationId, organizationId)))
  if (!found) return false
  await db.update(recordOfficer).set({ revokedAt: new Date() }).where(eq(recordOfficer.id, id))
  await adminEvent({ organizationId, actor: `user:${by}`, action: 'officer_revoked', subject: id, detail: found.name })
  return true
}

export async function adminEvent(e: { organizationId: string; actor: string; actorName?: string | null; action: string; subject?: string | null; detail?: string | null }) {
  await db.insert(recordAdminEvent).values({ id: crypto.randomUUID(), at: new Date(), organizationId: e.organizationId, actor: e.actor, actorName: e.actorName ?? null, action: e.action, subject: e.subject ?? null, detail: e.detail ?? null })
}

export const recentAdminEvents = (organizationId: string, limit = 100) => db.select().from(recordAdminEvent).where(eq(recordAdminEvent.organizationId, organizationId)).orderBy(desc(recordAdminEvent.at)).limit(limit)

// ---- Publication policy ---------------------------------------------------------------------------------------------

type Key = { jurisdiction: string; recordType: string; referenceKind: string }

export async function policyFor(organizationId: string, key: Key) {
  const [row] = await db
    .select()
    .from(recordPolicy)
    .where(and(eq(recordPolicy.organizationId, organizationId), eq(recordPolicy.jurisdiction, key.jurisdiction), eq(recordPolicy.recordType, key.recordType), eq(recordPolicy.referenceKind, key.referenceKind)))
  return row
}

/** What may not be published under this policy: no policy, a disabled one, a field the policy does not list, an audience a
 * field may not be offered to. Empty means the publication is within what the institution decided. */
export function policyViolations(policy: Awaited<ReturnType<typeof policyFor>>, fields: Record<string, unknown>, fieldPolicy: Record<string, string | string[]>): string[] {
  if (!policy || !policy.enabled) return ['This institution has no publication policy enabled for that kind of record. An institution owner sets it in Pleadli Account first.']
  let allowed: Record<string, string[]> = {}
  try {
    allowed = JSON.parse(policy.allowed)
  } catch {
    return ['The publication policy is unreadable, so nothing is published under it.']
  }
  const problems: string[] = []
  for (const name of Object.keys(fields)) {
    const ceiling = allowed[name]
    if (!ceiling) {
      problems.push(`${name}: the policy does not allow this field to be published`)
      continue
    }
    const offered = Array.isArray(fieldPolicy[name]) ? (fieldPolicy[name] as string[]) : [fieldPolicy[name] as string]
    const beyond = offered.filter((a) => !ceiling.includes(a))
    if (beyond.length) problems.push(`${name}: the policy does not allow it to be shown to ${beyond.join(', ')}`)
  }
  return problems
}
