import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { relayLink, relayMessage, relayOffice } from '@/db/relay-schema'
import { sign, type Signed } from '@/lib/orchestra-signing'
import { connected, decideLink, hasMailbox, whoOwns } from '@/lib/relay-links.server'
import { relayPairAllowed, relayPermitted } from '@/lib/relay-paths'
import { identify, sha256Of, type Caller } from '@/lib/computer-auth.server'
import { env } from 'cloudflare:workers'
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm'

/** The postbox relay, build step 1 (docs/platform/RELAY-DESIGN.md sections 3
 * to 5): post sealed bytes to an office, collect them, acknowledge, and see
 * progress. /api/orchestra/v1/relay/<call>.
 *
 * The relay never reads a package: it routes on the labels the sender states
 * next to the bytes. This skeleton has no connections yet (step 2), so for
 * safety a computer may post to an address its OWN institution owns, or to
 * one joined to it by an approved connection (relay-links.server.ts);
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

  // A connection is needed between institutions, not between one institution's own offices.
  if (!(await ownsAddress(caller, to)) && !(await connected(caller.address, to))) {
    throw new RelayError(403, 'not_connected', 'No approved connection to that office. Ask to connect first (POST /connections).', { to })
  }
  // Belonging to the same institution does NOT excuse a message from authorization: the kinds of the two licensed
  // institutions must have a defined path for this kind, whoever sends it. The kinds come from the licences of the two
  // addresses, not from anything the sender claims. The receiving application checks again from inside the package.
  const [sender, recipient] = await Promise.all([whoOwns(caller.address), whoOwns(to)])
  if (!relayPermitted(sender?.institutionType, recipient?.institutionType, kind)) {
    throw new RelayError(403, 'not_permitted', 'Pleadli defines no exchange of that kind between these two kinds of institution.', { kind })
  }
  // An address no computer collects at would hold the message until it expired and tell nobody.
  if (!(await hasMailbox(to))) {
    throw new RelayError(422, 'no_mailbox', 'No computer collects mail at that address. Ask the office for the receiving address shown on its Postbox.', { to })
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

/** Ask to connect to an office. A named administrator of that office decides
 * on Pleadli Account; the station sees the answer in GET /connections. */
async function askToConnect(request: Request, caller: Caller) {
  if (!caller.licensed) throw new RelayError(403, 'licence_needed', 'Asking to connect needs a licence.')
  const body = (await request.json().catch(() => null)) as { to?: unknown } | null
  const to = typeof body?.to === 'string' ? body.to.trim() : ''
  if (!ADDRESS.test(to)) throw new RelayError(400, 'bad_request', 'Send {"to": "<Orchestra address>"}.')
  const owner = await whoOwns(to)
  // The same answer for "no such office" and "not open to you": nothing to learn by guessing.
  if (!owner || to === caller.address) throw new RelayError(404, 'not_found', 'No such office.')
  // Only kinds of institution that have a defined exchange may even be connected.
  const me = await whoOwns(caller.address)
  if (!relayPairAllowed(me?.institutionType, owner.institutionType)) {
    throw new RelayError(403, 'not_permitted', 'Pleadli defines no exchange between your kind of institution and that office.')
  }
  if (!(await hasMailbox(to))) {
    throw new RelayError(422, 'no_mailbox', 'No computer collects mail at that address. Ask the office for the receiving address shown on its Postbox.', { to })
  }
  const [old] = await db
    .select()
    .from(relayLink)
    .where(or(and(eq(relayLink.fromAddress, caller.address), eq(relayLink.toAddress, to)), and(eq(relayLink.fromAddress, to), eq(relayLink.toAddress, caller.address))))
  if (old && (old.status === 'requested' || old.status === 'approved')) return json({ ok: true, id: old.id, status: old.status, duplicate: true })
  if (old && old.status === 'declined' && old.decidedAt && Date.now() - old.decidedAt.getTime() < 7 * DAY) {
    throw new RelayError(429, 'slow_down', 'That office declined recently. Try again in a few days.', { retryAfterSeconds: 86_400 })
  }
  const id = old?.id ?? crypto.randomUUID()
  const values = { fromAddress: caller.address, toAddress: to, status: 'requested', requestedBy: caller.computerId, decidedBy: null, reason: null, createdAt: new Date(), decidedAt: null }
  if (old) await db.update(relayLink).set(values).where(eq(relayLink.id, id))
  else await db.insert(relayLink).values({ id, ...values })
  return json({ ok: true, id, status: 'requested' }, 201)
}

/** An office ends its connection with another (a person at the office decided it in the app). Same effect as revoking on
 * Pleadli Account: the link stops carrying mail either way and the mail still waiting between the two is dropped.
 * Only the two ends of a link may do it, and only for a link that is live. */
async function endConnection(request: Request, caller: Caller) {
  if (!caller.licensed) throw new RelayError(403, 'licence_needed', 'Ending a connection needs a licence.')
  const body = (await request.json().catch(() => null)) as { with?: unknown; reason?: unknown } | null
  const other = typeof body?.with === 'string' ? body.with.trim() : ''
  if (!ADDRESS.test(other)) throw new RelayError(400, 'bad_request', 'Send {"with": "<Orchestra address>", "reason": "..."}.')
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  if (!reason) throw new RelayError(422, 'reason_needed', 'Say why the connection is being ended.')
  const me = await whoOwns(caller.address)
  const [link] = await db
    .select()
    .from(relayLink)
    .where(and(or(and(eq(relayLink.fromAddress, caller.address), eq(relayLink.toAddress, other)), and(eq(relayLink.fromAddress, other), eq(relayLink.toAddress, caller.address))), or(eq(relayLink.status, 'approved'), eq(relayLink.status, 'requested'))))
  if (!me || !link) throw new RelayError(404, 'not_found', 'No live connection with that office.')
  await decideLink(me.organizationId, link.id, 'revoke', `computer:${caller.computerId}`, reason)
  return json({ ok: true, id: link.id, status: 'revoked' })
}

/** My connections, both directions, with the other office's name and status. */
async function myConnections(caller: Caller) {
  const rows = await db
    .select()
    .from(relayLink)
    .where(or(eq(relayLink.fromAddress, caller.address), eq(relayLink.toAddress, caller.address)))
    .orderBy(desc(relayLink.createdAt))
    .limit(200)
  const items = await Promise.all(
    rows.map(async (r) => {
      const other = r.fromAddress === caller.address ? r.toAddress : r.fromAddress
      return { id: r.id, address: other, name: (await whoOwns(other))?.name ?? other, direction: r.fromAddress === caller.address ? 'asked' : 'asked_of_me', status: r.status, reason: r.status === 'declined' ? r.reason : null, decidedAt: r.decidedAt?.getTime() ?? null }
    }),
  )
  return json({ items })
}

/** The host that carries this office's mail: the one this Worker is served from (pleadli.com live, localhost:3000 in development). */
const relayHost = () => new URL(env.BETTER_AUTH_URL || 'https://pleadli.com').host
const KEY32 = /^[A-Za-z0-9_-]{43}$/
const YEAR = 365 * DAY

/** An office registers its two public keys (Ed25519 to sign, X25519 to be
 * sealed to) and receives a certificate signed by Pleadli (RELAY-DESIGN.md
 * section 7). An office can only certify an address its licensed institution
 * owns. Same keys again within six months return the same certificate; new
 * keys are a rotation and supersede the old one. */
async function putIdentity(request: Request, caller: Caller) {
  if (!caller.licensed) throw new RelayError(403, 'licence_needed', 'A certificate needs a licence.')
  const body = (await request.json().catch(() => null)) as { ed25519?: unknown; x25519?: unknown } | null
  const ed = typeof body?.ed25519 === 'string' ? body.ed25519 : ''
  const x = typeof body?.x25519 === 'string' ? body.x25519 : ''
  if (!KEY32.test(ed) || !KEY32.test(x)) throw new RelayError(400, 'bad_request', 'Send {"ed25519","x25519"}: each a 32-byte public key in base64url.')
  const owner = await whoOwns(caller.address)
  if (!owner || owner.organizationId !== caller.organizationId) throw new RelayError(403, 'forbidden', 'That address is not yours.')

  const now = Date.now()
  const [existing] = await db.select().from(relayOffice).where(eq(relayOffice.address, caller.address))
  const old = existing?.certificate as Signed | null | undefined
  if (old && existing?.ed25519Pub === ed && existing.x25519Pub === x) {
    const issuedAt = Number(JSON.parse(atob(old.payload.replace(/-/g, '+').replace(/_/g, '/'))).issuedAt)
    if (now - issuedAt < YEAR / 2) return json({ ok: true, certificate: old })
  }
  const certificate = await sign({
    type: 'office-certificate',
    address: caller.address,
    institution: owner.name,
    ed25519: ed,
    x25519: x,
    relay: relayHost(),
    issuedAt: now,
    expiresAt: now + YEAR,
  })
  const values = { organizationId: caller.organizationId, ed25519Pub: ed, x25519Pub: x, certificate, relay: relayHost(), name: owner.name, updatedAt: new Date(now) }
  if (existing) await db.update(relayOffice).set(values).where(eq(relayOffice.address, caller.address))
  else await db.insert(relayOffice).values({ address: caller.address, ...values })
  return json({ ok: true, certificate }, existing ? 200 : 201)
}

/** The certificate for an address, to seal to it. Only for an office of one's
 * own institution or one connected to this office; anything else is
 * `not_found`, so the list of offices cannot be walked. */
async function getCertificate(address: string, caller: Caller) {
  if (!ADDRESS.test(address)) throw new RelayError(404, 'not_found', 'No certificate.')
  const [row] = await db.select().from(relayOffice).where(eq(relayOffice.address, address))
  const allowed = row && (row.organizationId === caller.organizationId || (await connected(caller.address, address)))
  if (!row?.certificate || !allowed) throw new RelayError(404, 'not_found', 'No certificate.')
  return json({ certificate: row.certificate })
}

/** Who the relay takes this computer to be: the office address its posts come from and its mail goes to. The app shows this instead of guessing. */
async function whoami(caller: Caller) {
  const owner = await whoOwns(caller.address)
  return json({ address: caller.address, name: owner?.name ?? '', licensed: caller.licensed, relay: relayHost() })
}

/** /api/orchestra/v1/relay/<call> */
export async function handleRelayV1(request: Request, call: string) {
  try {
    const caller = await identify(request)
    if (!caller) throw new RelayError(401, 'unauthorised', 'Send the token your computer received when it activated its licence.')
    const url = new URL(request.url)
    const parts = call.split('/').filter(Boolean)
    const method = request.method
    if (method === 'GET' && parts.length === 1 && parts[0] === 'whoami') return await whoami(caller)
    if (method === 'POST' && parts.length === 1 && parts[0] === 'messages') return await post(request, caller)
    if (method === 'POST' && parts.length === 1 && parts[0] === 'connections') return await askToConnect(request, caller)
    if (method === 'POST' && parts.length === 2 && parts[0] === 'connections' && parts[1] === 'revoke') return await endConnection(request, caller)
    if (method === 'GET' && parts.length === 1 && parts[0] === 'connections') return await myConnections(caller)
    if (method === 'PUT' && parts.length === 1 && parts[0] === 'identity') return await putIdentity(request, caller)
    if (method === 'GET' && parts.length === 2 && parts[0] === 'certificates') return await getCertificate(parts[1], caller)
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
