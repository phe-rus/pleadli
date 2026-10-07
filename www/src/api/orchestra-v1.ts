import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { computer, licence, paper, trackingCode, trackingEvent } from '@/db/orchestra-schema'
import { APPLICATIONS, DAY, TRIAL_DAYS, sha256Hex } from '@/lib/orchestra'
import { CERT, newToken, publicKey, sign, KEY_ID } from '@/lib/orchestra-signing'
import { and, eq, ne } from 'drizzle-orm'
import * as z from 'zod'

/** The API the apps call: /api/orchestra/v1/<name>
 * (docs/platform/ORCHESTRA-API.md). It receives machine hashes, versions and
 * licence state, and the fingerprints of issued papers; never case content. */

/** A licence is refreshed every 7 days and keeps working 30 days past that
 * with no internet (docs/platform/ORCHESTRA-PLAN.md section 3). */
const REFRESH_DAYS = 7
const GRACE_DAYS = 30

export const TRACKING_STAGES = ['reported', 'investigating', 'with_dpp', 'charged', 'in_court', 'remanded', 'on_bail', 'judgment', 'released', 'closed'] as const

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 in lowercase hex')
const device = z.object({
  device: hex64, // SHA-256 of the operating system's machine identifier
  application: z.enum(APPLICATIONS),
  version: z.string().max(40).optional(),
  os: z.string().max(40).optional(),
  country: z.string().length(2).toLowerCase().optional(),
})

const now = () => new Date()

async function findComputer(deviceHash: string, application: string) {
  const [row] = await db.select().from(computer).where(and(eq(computer.deviceHash, deviceHash), eq(computer.application, application)))
  return row
}

/** First contact makes the computer known and fixes its trial start: the
 * earlier of what pleadli.com already holds and what the app kept locally, so
 * a reinstall continues the same 30 days. Later calls refresh last seen. */
async function touch(input: z.infer<typeof device> & { localTrialStartedAt?: number }) {
  const at = now()
  const existing = await findComputer(input.device, input.application)
  const local = input.localTrialStartedAt && input.localTrialStartedAt < at.getTime() ? new Date(input.localTrialStartedAt) : undefined
  if (!existing) {
    const row = {
      id: crypto.randomUUID(),
      deviceHash: input.device,
      application: input.application,
      version: input.version ?? null,
      os: input.os ?? null,
      country: input.country ?? null,
      trialStartedAt: local ?? at,
      firstSeenAt: at,
      lastSeenAt: at,
    }
    await db.insert(computer).values(row)
    return (await findComputer(input.device, input.application))!
  }
  const trialStartedAt = local && local < existing.trialStartedAt ? local : existing.trialStartedAt
  await db
    .update(computer)
    .set({ lastSeenAt: at, trialStartedAt, version: input.version ?? existing.version, os: input.os ?? existing.os, country: input.country ?? existing.country })
    .where(eq(computer.id, existing.id))
  return { ...existing, lastSeenAt: at, trialStartedAt }
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function bearer(request: Request) {
  const value = request.headers.get('authorization') ?? ''
  return value.startsWith('Bearer ') ? value.slice(7).trim() : ''
}

/** A computer speaks for its institution only with the token it was given
 * when it activated a licence. */
async function authorised(request: Request, row: typeof computer.$inferSelect) {
  const token = bearer(request)
  return !!token && !!row.tokenHash && (await tokenHash(token)) === row.tokenHash
}

/** What every licence call answers: the trial, and the signed licence when
 * this computer holds a valid one. The app shows the trial bar from this. */
async function state(row: typeof computer.$inferSelect, trusted: boolean) {
  const at = now()
  const trialEndsAt = row.trialStartedAt.getTime() + TRIAL_DAYS * DAY
  const trial = { startedAt: row.trialStartedAt.getTime(), endsAt: trialEndsAt, ended: trialEndsAt <= at.getTime() }
  if (!row.licenceId || !trusted) return { state: trial.ended ? 'trial_ended' : 'trial', trial, licence: null, serverTime: at.getTime() }

  const [found] = await db
    .select({ l: licence, org: { name: organization.name, address: organization.address, status: organization.status } })
    .from(licence)
    .innerJoin(organization, eq(organization.id, licence.organizationId))
    .where(eq(licence.id, row.licenceId))
  const valid = found && found.l.status === 'active' && found.org.status === 'active' && found.l.expiresAt > at
  if (!found || !valid) {
    return { state: 'licence_ended', trial, licence: null, reason: !found ? 'removed' : found.l.status !== 'active' ? 'revoked' : found.org.status !== 'active' ? 'suspended' : 'expired', serverTime: at.getTime() }
  }
  const validUntil = Math.min(found.l.expiresAt.getTime(), at.getTime() + (REFRESH_DAYS + GRACE_DAYS) * DAY)
  const signed = await sign({
    v: 1,
    kind: 'pleadli.licence',
    licence: found.l.id,
    institution: found.org.name,
    address: found.org.address,
    application: found.l.application,
    seats: found.l.seats,
    device: row.deviceHash,
    issuedAt: at.getTime(),
    refreshAfter: at.getTime() + REFRESH_DAYS * DAY,
    validUntil,
    expiresAt: found.l.expiresAt.getTime(),
  })
  return { state: 'licensed', trial, licence: signed, serverTime: at.getTime() }
}

const handlers: Record<string, { method: 'GET' | 'POST'; run: (request: Request, body: unknown) => Promise<unknown> }> = {
  /** Pleadli's public key, for checking licences offline. */
  key: { method: 'GET', run: async () => ({ key: KEY_ID, algorithm: 'Ed25519', publicKey: await publicKey(), cert: CERT }) },

  /** First launch, and any launch: "this computer runs this app". */
  trial: {
    method: 'POST',
    run: async (request, body) => {
      const input = device.extend({ localTrialStartedAt: z.number().int().positive().optional() }).parse(body)
      const row = await touch(input)
      return state(row, await authorised(request, row))
    },
  },

  /** The licence key typed once: counted against the seats, and answered with
   * the signed licence and the token this computer keeps. */
  activate: {
    method: 'POST',
    run: async (_request, body) => {
      const input = device.extend({ key: z.string().min(10).max(40) }).parse(body)
      const [found] = await db
        .select({ l: licence, orgStatus: organization.status })
        .from(licence)
        .innerJoin(organization, eq(organization.id, licence.organizationId))
        .where(eq(licence.keyHash, await sha256Hex(input.key)))
      if (!found) throw new ApiError(404, 'unknown_key', 'No licence has this key. Check it with your administrator.')
      if (found.l.status !== 'active') throw new ApiError(403, 'revoked', 'This licence has been revoked.')
      if (found.orgStatus !== 'active') throw new ApiError(403, 'suspended', 'This institution is not active on Pleadli Orchestra.')
      if (found.l.expiresAt <= now()) throw new ApiError(403, 'expired', 'This licence has ended.')
      if (found.l.application !== input.application) throw new ApiError(403, 'wrong_application', `This licence is for Pleadli ${found.l.application}, not this app.`)

      const row = await touch(input)
      if (row.licenceId !== found.l.id) {
        const others = await db.select({ id: computer.id }).from(computer).where(and(eq(computer.licenceId, found.l.id), ne(computer.id, row.id)))
        if (others.length >= found.l.seats)
          throw new ApiError(409, 'seats_full', `All ${found.l.seats} computers on this licence are in use. Your administrator can free one on pleadli.com/orchestra.`)
      }
      const token = newToken()
      await db.update(computer).set({ licenceId: found.l.id, organizationId: found.l.organizationId, tokenHash: await tokenHash(token) }).where(eq(computer.id, row.id))
      const updated = (await findComputer(input.device, input.application))!
      return { ...(await state(updated, true)), token }
    },
  },

  /** Every few hours while online, and at least every 7 days: last seen, and
   * the licence signed afresh. */
  heartbeat: {
    method: 'POST',
    run: async (request, body) => {
      const row = await touch(device.parse(body))
      return state(row, await authorised(request, row))
    },
  },

  /** A paper was issued: record its fingerprint so pleadli.com/verify can
   * answer for it. Needs a licensed computer, which names the institution. */
  papers: {
    method: 'POST',
    run: async (request, body) => {
      const input = device
        .extend({
          code: z.string().transform(normaliseCode).pipe(z.string().min(8).max(24)),
          reference: z.string().trim().min(1).max(80),
          kind: z.string().regex(/^[a-z0-9_]{2,40}$/),
          office: z.string().trim().toLowerCase().max(120),
          contentSha256: hex64,
          fileSha256: hex64.optional(),
          issuedAt: z.number().int().positive(),
        })
        .parse(body)
      const row = await licensedComputer(request, input)
      await officeOf(row.organizationId!, input.office)
      const [existing] = await db.select().from(paper).where(eq(paper.code, input.code))
      if (existing) {
        if (existing.organizationId !== row.organizationId || existing.contentSha256 !== input.contentSha256) throw new ApiError(409, 'code_taken', 'Another paper already has this code.')
        // The same paper sent again (a retry, or now with its PDF): keep the first record.
        if (input.fileSha256 && !existing.fileSha256) await db.update(paper).set({ fileSha256: input.fileSha256 }).where(eq(paper.id, existing.id))
        return { ok: true, code: input.code }
      }
      await db.insert(paper).values({
        id: crypto.randomUUID(),
        code: input.code,
        reference: input.reference,
        kind: input.kind,
        application: input.application,
        organizationId: row.organizationId!,
        office: input.office,
        computerId: row.id,
        contentSha256: input.contentSha256,
        fileSha256: input.fileSha256 ?? null,
        issuedAt: new Date(input.issuedAt),
        recordedAt: now(),
      })
      return { ok: true, code: input.code }
    },
  },

  /** A paper was withdrawn or replaced: /verify says so from now on. */
  'papers/withdraw': {
    method: 'POST',
    run: async (request, body) => {
      const input = device.extend({ code: z.string().transform(normaliseCode), reason: z.string().trim().max(200).optional() }).parse(body)
      const row = await licensedComputer(request, input)
      const [existing] = await db.select().from(paper).where(and(eq(paper.code, input.code), eq(paper.organizationId, row.organizationId!)))
      if (!existing) throw new ApiError(404, 'unknown_paper', 'No paper of this institution has this code.')
      if (!existing.withdrawnAt) await db.update(paper).set({ withdrawnAt: now(), withdrawnReason: input.reason ?? null }).where(eq(paper.id, existing.id))
      return { ok: true }
    },
  },

  /** A case's stage changed: the tracking code (made by the app, printed for
   * the person concerned) shows the new stage on pleadli.com/track. */
  track: {
    method: 'POST',
    run: async (request, body) => {
      const input = device
        .extend({
          code: z.string().transform(normaliseCode).pipe(z.string().length(12)),
          stage: z.enum(TRACKING_STAGES),
          office: z.string().trim().toLowerCase().max(120).optional(),
          at: z.number().int().positive(),
          nextAt: z.number().int().positive().optional(),
        })
        .parse(body)
      const row = await licensedComputer(request, input)
      // The case may now be with another institution's office (a court, a
      // prison): any issued address will do, it is only shown by name.
      if (input.office) await anyOffice(input.office)
      const [existing] = await db.select().from(trackingCode).where(eq(trackingCode.code, input.code))
      if (!existing) await db.insert(trackingCode).values({ code: input.code, organizationId: row.organizationId!, computerId: row.id, createdAt: now() })
      else if (existing.organizationId !== row.organizationId) throw new ApiError(409, 'code_taken', 'Another institution already uses this tracking code.')
      await db.insert(trackingEvent).values({
        id: crypto.randomUUID(),
        code: input.code,
        stage: input.stage,
        office: input.office ?? null,
        at: new Date(input.at),
        nextAt: input.nextAt ? new Date(input.nextAt) : null,
        recordedAt: now(),
      })
      return { ok: true, code: input.code }
    },
  },
}

/** Codes are compared without case, spaces or dashes: "a1b2-c3d4" = "A1B2C3D4". */
export function normaliseCode(text: string) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function licensedComputer(request: Request, input: z.infer<typeof device>) {
  const row = await findComputer(input.device, input.application)
  if (!row || !(await authorised(request, row))) throw new ApiError(401, 'not_activated', 'This computer has not activated a licence.')
  const current = await state(row, true)
  if (current.state !== 'licensed' || !row.organizationId) throw new ApiError(403, 'licence_needed', 'This needs a valid licence.')
  await db.update(computer).set({ lastSeenAt: now() }).where(eq(computer.id, row.id))
  return row
}

/** The office must be the institution itself or one of its own offices. */
async function officeOf(organizationId: string, address: string) {
  const [org] = await db.select({ address: organization.address }).from(organization).where(eq(organization.id, organizationId))
  if (org?.address === address) return
  const [unit] = await db.select({ id: organizationUnit.id }).from(organizationUnit).where(and(eq(organizationUnit.organizationId, organizationId), eq(organizationUnit.address, address)))
  if (!unit) throw new ApiError(422, 'unknown_office', `${address} is not one of this institution's offices.`)
}

async function anyOffice(address: string) {
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.address, address))
  if (org) return
  const [unit] = await db.select({ id: organizationUnit.id }).from(organizationUnit).where(eq(organizationUnit.address, address))
  if (!unit) throw new ApiError(422, 'unknown_office', `No office has the address ${address}.`)
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

export async function handleOrchestraV1(request: Request, path: string) {
  const handler = handlers[path.replace(/^\/+|\/+$/g, '')]
  if (!handler) return json(404, { error: 'not_found', message: 'No such endpoint.' })
  if (request.method !== handler.method) return json(405, { error: 'method_not_allowed', message: `Use ${handler.method}.` })
  try {
    const body = handler.method === 'POST' ? await request.json().catch(() => ({})) : undefined
    return json(200, await handler.run(request, body))
  } catch (error) {
    if (error instanceof ApiError) return json(error.status, { error: error.code, message: error.message })
    if (error instanceof z.ZodError) return json(400, { error: 'invalid', message: 'The request is not valid.', issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) })
    console.error('orchestra v1', path, error)
    return json(500, { error: 'server', message: 'Something went wrong at pleadli.com.' })
  }
}
