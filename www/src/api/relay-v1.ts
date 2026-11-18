import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { relayMessage } from '@/db/relay-schema'
import { identify, sha256Of, type Caller } from '@/lib/computer-auth.server'
import { env } from 'cloudflare:workers'
import { and, asc, count, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm'

/** The postbox relay, build step 1 (docs/platform/RELAY-DESIGN.md sections 3
 * to 5): post sealed bytes to an office, collect them, acknowledge, and see
 * progress. /api/orchestra/v1/relay/<call>.
 *
 * The relay never reads a package: it routes on the labels the sender states
 * next to the bytes. This skeleton has no connections yet (step 2), so for
 * safety a computer may only post to an address its OWN institution owns;
 * anything else answers `not_connected`. */

/** Numbers are config, not logic (RELAY-DESIGN.md section 4). */
export const LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  queuedBytesPerOffice: 500 * 1024 * 1024,
  postsPerHour: 60,
  holdDays: 30,
  historyDays: 60,
  inboxPage: 50,
} as const

const DAY = 86_400_000
const HOUR = 3_600_000

class RelayError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEX64 = /^[0-9a-f]{64}$/
const ADDRESS = /^[a-z]{2}(\.[a-z0-9]+(-[a-z0-9]+)*){2,4}$/
const KIND = /^[a-z][a-z0-9_]{1,39}$/

const blobKey = (to: string, id: string) => `relay/${to}/${id}`

/** True when this institution owns the address (itself or one of its offices). */
async function ownsAddress(caller: Caller, address: string) {
  const [org] = await db.select({ id: organization.id }).from(organization).where(and(eq(organization.id, caller.organizationId), eq(organization.address, address)))
  if (org) return true
  const [unit] = await db
    .select({ id: organizationUnit.id })
    .from(organizationUnit)
    .where(and(eq(organizationUnit.organizationId, caller.organizationId), eq(organizationUnit.address, address)))
  return !!unit
}

async function post(request: Request, caller: Caller) {
  if (!caller.licensed) throw new RelayError(403, 'licence_needed', 'Posting needs a licence. Collecting your own mail does not.')
  const h = request.headers
  const id = h.get('x-pleadli-id') ?? ''
  const to = h.get('x-pleadli-to') ?? ''
  const kind = h.get('x-pleadli-kind') ?? ''
  const claimed = (h.get('x-pleadli-sha256') ?? '').toLowerCase()
  if (!UUID.test(id)) throw new RelayError(400, 'bad_request', 'x-pleadli-id must be a UUID (the package id).')
  if (!ADDRESS.test(to)) throw new RelayError(400, 'bad_request', 'x-pleadli-to must be an Orchestra address.')
  if (!KIND.test(kind)) throw new RelayError(400, 'bad_request', 'x-pleadli-kind must be a short lowercase label.')
  if (!HEX64.test(claimed)) throw new RelayError(400, 'bad_request', 'x-pleadli-sha256 must be the SHA-256 of the body in lowercase hex.')
  const declared = Number(h.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > LIMITS.maxBytes) throw new RelayError(413, 'too_large', `A message is at most ${LIMITS.maxBytes} bytes.`)

  // A retry of the same package id is answered, not stored twice.
  const [again] = await db.select().from(relayMessage).where(eq(relayMessage.id, id))
  if (again) {
    if (again.fromAddress !== caller.address) throw new RelayError(409, 'id_taken', 'That package id belongs to another sender.')
    return json({ ok: true, id, postedAt: again.postedAt.getTime(), duplicate: true })
  }

  if (!(await ownsAddress(caller, to))) {
    throw new RelayError(403, 'not_connected', 'No approved connection to that office. Ask to connect first.', { to })
  }

  const now = Date.now()
  const [recent] = await db.select({ n: count() }).from(relayMessage).where(and(eq(relayMessage.fromAddress, caller.address), gt(relayMessage.postedAt, new Date(now - HOUR))))
  if ((recent?.n ?? 0) >= LIMITS.postsPerHour) throw new RelayError(429, 'slow_down', 'Too many posts this hour.', { retryAfterSeconds: 600 })
  const [queued] = await db
    .select({ bytes: sql<number>`coalesce(sum(${relayMessage.size}), 0)` })
    .from(relayMessage)
    .where(and(eq(relayMessage.toAddress, to), isNull(relayMessage.ackedAt), gt(relayMessage.expiresAt, new Date(now))))

  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0) throw new RelayError(400, 'bad_request', 'The body is empty.')
  if (bytes.byteLength > LIMITS.maxBytes) throw new RelayError(413, 'too_large', `A message is at most ${LIMITS.maxBytes} bytes.`)
  if ((queued?.bytes ?? 0) + bytes.byteLength > LIMITS.queuedBytesPerOffice) throw new RelayError(429, 'quota', 'That office has too much waiting mail. Try again later.')
  if ((await sha256Of(bytes)) !== claimed) throw new RelayError(400, 'hash_mismatch', 'The body does not match x-pleadli-sha256.')

  const key = blobKey(to, id)
  await env.POSTBOX.put(key, bytes, { httpMetadata: { contentType: 'application/octet-stream' } })
  const postedAt = new Date(now)
  await db.insert(relayMessage).values({
    id,
    fromAddress: caller.address,
    toAddress: to,
    kind,
    size: bytes.byteLength,
    sha256: claimed,
    blobKey: key,
    postedAt,
    expiresAt: new Date(now + LIMITS.holdDays * DAY),
  })
  return json({ ok: true, id, postedAt: now }, 201)
}

async function inbox(url: URL, caller: Caller) {
  const after = Number(url.searchParams.get('after') ?? '0')
  const rows = await db
    .select()
    .from(relayMessage)
    .where(
      and(
        eq(relayMessage.toAddress, caller.address),
        isNull(relayMessage.ackedAt),
        gt(relayMessage.expiresAt, new Date()),
        gt(relayMessage.postedAt, new Date(Number.isFinite(after) ? after : 0)),
      ),
    )
    .orderBy(asc(relayMessage.postedAt))
    .limit(LIMITS.inboxPage)
  const items = rows.map((r) => ({ id: r.id, from: r.fromAddress, kind: r.kind, size: r.size, sha256: r.sha256, postedAt: r.postedAt.getTime() }))
  // The cursor is the last postedAt seen; ask again with it to continue.
  return json({ items, cursor: items.at(-1)?.postedAt ?? (Number.isFinite(after) ? after : 0), more: rows.length === LIMITS.inboxPage })
}

/** Only the addressee may fetch the bytes; anyone else is told it does not exist. */
async function mine(id: string, caller: Caller) {
  if (!UUID.test(id)) throw new RelayError(404, 'not_found', 'No such message.')
  const [row] = await db.select().from(relayMessage).where(eq(relayMessage.id, id))
  if (!row || row.toAddress !== caller.address || row.ackedAt || row.expiresAt <= new Date()) throw new RelayError(404, 'not_found', 'No such message.')
  return row
}

async function fetchBytes(id: string, caller: Caller) {
  const row = await mine(id, caller)
  const object = await env.POSTBOX.get(row.blobKey)
  if (!object) throw new RelayError(404, 'not_found', 'No such message.')
  if (!row.deliveredAt) await db.update(relayMessage).set({ deliveredAt: new Date() }).where(eq(relayMessage.id, id))
  return new Response(object.body, {
    headers: { 'content-type': 'application/octet-stream', 'x-pleadli-sha256': row.sha256, 'x-pleadli-from': row.fromAddress, 'x-pleadli-kind': row.kind, 'cache-control': 'no-store' },
  })
}

async function ack(id: string, caller: Caller) {
  const row = await mine(id, caller)
  await env.POSTBOX.delete(row.blobKey)
  await db.update(relayMessage).set({ ackedAt: new Date(), deliveredAt: row.deliveredAt ?? new Date() }).where(eq(relayMessage.id, id))
  return json({ ok: true })
}

async function outboxStatus(url: URL, caller: Caller) {
  const ids = (url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter((s) => UUID.test(s)).slice(0, LIMITS.inboxPage)
  if (!ids.length) return json({ items: [] })
  const rows = await db.select().from(relayMessage).where(and(eq(relayMessage.fromAddress, caller.address), inArray(relayMessage.id, ids)))
  const now = new Date()
  const items = rows.map((r) => ({
    id: r.id,
    status: r.ackedAt ? 'acked' : r.expiresAt <= now ? 'expired' : r.deliveredAt ? 'delivered' : 'posted',
    postedAt: r.postedAt.getTime(),
    deliveredAt: r.deliveredAt?.getTime() ?? null,
    ackedAt: r.ackedAt?.getTime() ?? null,
  }))
  return json({ items })
}

/** /api/orchestra/v1/relay/<call> */
export async function handleRelayV1(request: Request, call: string) {
  try {
    const caller = await identify(request)
    if (!caller) throw new RelayError(401, 'unauthorised', 'Send the token your computer received when it activated its licence.')
    const url = new URL(request.url)
    const parts = call.split('/').filter(Boolean)
    const method = request.method
    if (method === 'POST' && parts.length === 1 && parts[0] === 'messages') return await post(request, caller)
    if (method === 'GET' && parts.length === 1 && parts[0] === 'inbox') return await inbox(url, caller)
    if (method === 'GET' && parts.length === 1 && parts[0] === 'outbox') return await outboxStatus(url, caller)
    if (method === 'GET' && parts.length === 2 && parts[0] === 'messages') return await fetchBytes(parts[1], caller)
    if (method === 'POST' && parts.length === 3 && parts[0] === 'messages' && parts[2] === 'ack') return await ack(parts[1], caller)
    throw new RelayError(404, 'unknown_call', 'No such relay call.')
  } catch (error) {
    if (error instanceof RelayError) return json({ error: error.code, message: error.message, ...error.extra }, error.status)
    console.error('relay error', error)
    return json({ error: 'server_error', message: 'The relay could not do that. Try again.' }, 500)
  }
}

/** The daily sweeper (a scheduled Worker): delete bytes nobody collected
 * within the hold time, and whole rows past the history limit. Keeps both D1
 * writes and R2 storage inside the free plan (RELAY-DESIGN.md section 4a). */
export async function sweepRelay() {
  const now = Date.now()
  const stale = await db
    .select({ id: relayMessage.id, blobKey: relayMessage.blobKey })
    .from(relayMessage)
    .where(and(isNull(relayMessage.ackedAt), lt(relayMessage.expiresAt, new Date(now))))
    .limit(500)
  for (const row of stale) await env.POSTBOX.delete(row.blobKey)
  const old = await db.delete(relayMessage).where(lt(relayMessage.postedAt, new Date(now - LIMITS.historyDays * DAY)))
  return { expired: stale.length, pruned: old.meta?.changes ?? 0 }
}
