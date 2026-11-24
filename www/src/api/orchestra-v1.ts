import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { supportReport } from '@/db/orchestra-schema'
import { recordAccess, recordCredential, recordGrant, recordProjection } from '@/db/records-schema'
import { AUDIENCES, normaliseReference, STATUSES } from '@/lib/records.server'
import { sha256Of } from '@/lib/computer-auth.server'
import { limitOfficer } from '@/lib/quota.server'
import { adminEvent, authoriseOfficer, policyFor, policyViolations, type Permission } from '@/lib/records-authority.server'
import { backupKey, backupReport, computer, licence, paper, storageSeal, storageTarget, trackingCode, trackingEvent } from '@/db/orchestra-schema'
import { APPLICATIONS, DAY, TRACKING_STAGES, TRIAL_DAYS, normaliseCode, sha256Hex } from '@/lib/orchestra'
import { CERT, newToken, publicKey, sign, KEY_ID, b64url } from '@/lib/orchestra-signing'
import { and, desc, eq, ne } from 'drizzle-orm'
import * as z from 'zod'

/** The API the apps call: /api/orchestra/v1/<name>
 * (docs/platform/ORCHESTRA-API.md). It receives machine hashes, versions and
 * licence state, and the fingerprints of issued papers; never case content. */

/** A licence is refreshed every 7 days and keeps working 30 days past that
 * with no internet (docs/platform/ORCHESTRA-PLAN.md section 3). */
const REFRESH_DAYS = 7
const GRACE_DAYS = 30

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
  // The computer's seal public key (base64url X25519, ORCHESTRA-BACKUP.md).
  sealKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
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

/** A seal key is taken only on a call the computer proved with its token, so
 * nobody else can put their key in its place. A new key drops the computer's
 * storage access: what was sealed to the old key cannot be opened anyway. */
async function keepSealKey(row: typeof computer.$inferSelect, sealKey: string | undefined) {
  if (!sealKey || sealKey === row.sealKey) return
  await db.update(computer).set({ sealKey }).where(eq(computer.id, row.id))
  if (row.sealKey) await db.delete(storageSeal).where(eq(storageSeal.computerId, row.id))
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
  // The institution and its offices, so a computer can say which office it
  // issues papers for (ORCHESTRA-API.md, papers.office).
  const units = await db
    .select({ address: organizationUnit.address, name: organizationUnit.name })
    .from(organizationUnit)
    .where(eq(organizationUnit.organizationId, found.l.organizationId))
  const offices = [{ address: found.org.address, name: found.org.name }, ...units].filter((o): o is { address: string; name: string } => !!o.address)
  return { state: 'licensed', trial, licence: signed, offices, serverTime: at.getTime() }
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
      await keepSealKey(row, input.sealKey)
      const updated = (await findComputer(input.device, input.application))!
      return { ...(await state(updated, true)), token }
    },
  },

  /** Every few hours while online, and at least every 7 days: last seen, and
   * the licence signed afresh. */
  heartbeat: {
    method: 'POST',
    run: async (request, body) => {
      const input = device.parse(body)
      const row = await touch(input)
      const trusted = await authorised(request, row)
      if (trusted) await keepSealKey(row, input.sealKey)
      return state(row, trusted)
    },
  },

  /** Where this computer backs up to: the institution's backup public key,
   * and each storage with the secret sealed to this computer once an
   * administrator has approved it. Backups need a licence. */
  'backup/config': {
    method: 'POST',
    run: async (request, body) => {
      const input = device.parse(body)
      const row = await licensedComputer(request, input)
      const [key] = await db.select().from(backupKey).where(eq(backupKey.organizationId, row.organizationId!))
      const targets = await db.select().from(storageTarget).where(eq(storageTarget.organizationId, row.organizationId!))
      const seals = await db.select().from(storageSeal).where(eq(storageSeal.computerId, row.id))
      return {
        // Storage secrets are sealed under this id (ORCHESTRA-BACKUP.md), and
        // backups are filed under it.
        computer: row.id,
        backupKey: key ? { publicKey: key.publicKey, fingerprint: key.fingerprint } : null,
        storage: targets.map((t) => {
          const seal = seals.find((s) => s.storageId === t.id)
          return { id: t.id, label: t.label, kind: t.kind, settings: JSON.parse(t.settings), approved: !!seal, sealed: seal?.sealed ?? null }
        }),
      }
    },
  },

  /** After each backup: when, how large, whether it worked. Never the backup. */
  'backup/report': {
    method: 'POST',
    run: async (request, body) => {
      const input = device
        .extend({
          storageId: z.string().max(60).optional(),
          at: z.number().int().positive(),
          sizeBytes: z.number().int().nonnegative().optional(),
          ok: z.boolean(),
          message: z.string().trim().max(300).optional(),
        })
        .parse(body)
      const row = await licensedComputer(request, input)
      await db.insert(backupReport).values({
        id: crypto.randomUUID(),
        computerId: row.id,
        organizationId: row.organizationId,
        storageId: input.storageId ?? null,
        at: new Date(input.at),
        sizeBytes: input.sizeBytes ?? null,
        ok: input.ok,
        message: input.message ?? null,
      })
      return { ok: true }
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
          // What the institution chooses to show the public. Left out means the safe default:
          // the kind of paper, the office and the date, but not the file reference.
          publicFields: z.array(z.enum(['reference', 'kind', 'office', 'issuedAt'])).max(4).default(['kind', 'office', 'issuedAt']),
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
        publicFields: JSON.stringify([...new Set(input.publicFields)]),
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
      const input = device.extend({ code: z.string().transform(normaliseCode), reason: z.string().trim().max(200).optional(), supersededByCode: z.string().transform(normaliseCode).pipe(z.string().min(8).max(24)).optional() }).parse(body)
      const row = await licensedComputer(request, input)
      const [existing] = await db.select().from(paper).where(and(eq(paper.code, input.code), eq(paper.organizationId, row.organizationId!)))
      if (!existing) throw new ApiError(404, 'unknown_paper', 'No paper of this institution has this code.')
      if (input.supersededByCode) {
        // The replacement must be a paper of the same institution, so nobody can point a withdrawn paper at a stranger's.
        const [next] = await db.select().from(paper).where(and(eq(paper.code, input.supersededByCode), eq(paper.organizationId, row.organizationId!)))
        if (!next) throw new ApiError(404, 'unknown_paper', 'The replacing paper is not one of this institution.')
      }
      if (!existing.withdrawnAt) await db.update(paper).set({ withdrawnAt: now(), withdrawnReason: input.reason ?? null, supersededByCode: input.supersededByCode ?? null }).where(eq(paper.id, existing.id))
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
      else if (existing.unpublishedAt) throw new ApiError(409, 'unpublished', 'This case is not published. Publish it again on purpose before adding steps.')
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

// ---- Help and diagnostics: the private support channel ---------------------------------------------------------
/** The bundle's exact shape (packages/node-core/src/diagnostics.rs, FORMAT 1). Strict: a field that is not in the
 * format is refused, so a client cannot send case content, keys or anything else the person did not preview. */
const code = z.string().regex(/^[a-z0-9_.]{1,48}$/)
const bundleV1 = z
  .object({
    format: z.literal(1),
    report_id: z.string().uuid(),
    kind: z.enum(['bug', 'crash', 'diagnostics']),
    app: z.enum(APPLICATIONS),
    app_version: z.string().max(40),
    os: z.string().max(40),
    arch: z.string().max(40),
    created_at: z.number().int().positive(),
    error_code: code.nullable(),
    description: z.string().max(2_100),
    crash: z
      .object({ source: z.enum(['rust_panic', 'frontend_error']), location: z.string().max(120).nullable(), message: z.string().max(2_100), frames: z.array(z.string().max(200)).max(24) })
      .strict()
      .nullable(),
    events: z.array(z.object({ at: z.number().int(), code, detail: z.string().max(200).nullable() }).strict()).max(200),
  })
  .strict()

/** A person chose to send a report. Needs a computer that has activated (so reports can be answered), not a licence:
 * a trial copy that crashes must be able to say so. */
handlers['diagnostics'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ bundle: bundleV1 }).parse(body)
    const row = await findComputer(input.device, input.application)
    if (!row || !(await authorised(request, row))) throw new ApiError(401, 'not_activated', 'This computer has not activated.')
    if (input.bundle.app !== input.application) throw new ApiError(422, 'mismatch', 'The report is for a different application.')
    // The report id was made on the computer, so a retry is the same report and is not stored twice.
    const [existing] = await db.select({ id: supportReport.id, computerId: supportReport.computerId }).from(supportReport).where(eq(supportReport.id, input.bundle.report_id))
    if (existing) {
      if (existing.computerId !== row.id) throw new ApiError(409, 'report_taken', 'That report id is already used.')
      return { ok: true, reportId: existing.id, duplicate: true }
    }
    const text = JSON.stringify(input.bundle, null, 2)
    if (text.length > 64_000) throw new ApiError(413, 'too_large', 'The report is too large.')
    // The existing support inbox (kinds crash | issue | question, staff reply) carries it: the bundle is the body.
    const kind = input.bundle.kind === 'crash' ? 'crash' : 'issue'
    const title = `${input.bundle.kind === 'crash' ? 'Crash' : input.bundle.kind === 'bug' ? 'Bug' : 'Diagnostics'} in ${input.application} ${input.bundle.app_version}${input.bundle.error_code ? `: ${input.bundle.error_code}` : ''}`
    await db.insert(supportReport).values({ id: input.bundle.report_id, kind, application: input.application, version: input.bundle.app_version, computerId: row.id, organizationId: row.organizationId ?? null, title, body: text, status: 'open', createdAt: now() })
    return { ok: true, reportId: input.bundle.report_id }
  },
}

/** What support says about a report this computer sent. Only the sender's own computer can ask. */
handlers['diagnostics/status'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ reportId: z.string().uuid() }).parse(body)
    const row = await findComputer(input.device, input.application)
    if (!row || !(await authorised(request, row))) throw new ApiError(401, 'not_activated', 'This computer has not activated.')
    const [found] = await db.select().from(supportReport).where(and(eq(supportReport.id, input.reportId), eq(supportReport.computerId, row.id)))
    if (!found) throw new ApiError(404, 'unknown_report', 'No report from this computer has that id.')
    return { ok: true, status: found.status, reply: found.reply, receivedAt: found.createdAt.getTime(), repliedAt: found.repliedAt?.getTime() ?? null }
  },
}

// ---- The records API, institution side (docs/platform/RECORDS-API.md) ----------------------------------------
// A licensed computer only says WHICH MACHINE is calling. Every sensitive call here must also carry the secret of a named
// officer whom an institution owner authorised on the web, with the one permission the call needs (publish, approve,
// revoke, credentials, audit). Publishing is further limited by the institution's own policy, which has no default.
// Every call is written to the institution's admin audit under the officer's name.

async function officerFor(request: Request, row: { id: string; organizationId: string | null }, permission: Permission) {
  const result = await authoriseOfficer(request, row.organizationId!, row.id, permission)
  if ('refusal' in result) throw new ApiError(result.refusal.status, result.refusal.code, result.refusal.message)
  // Authoritative and fail closed: if the counter cannot be reached, a credential or grant is not touched.
  const quota = await limitOfficer({ organizationId: row.organizationId!, officerId: result.officer.id })
  if (!quota.ok) throw new ApiError(quota.unavailable ? 503 : 429, quota.unavailable ? 'service_unavailable' : 'too_many_requests', quota.unavailable ? 'The quota service cannot be reached, so this was not done. Try again in a few seconds.' : `Too many requests. Try again in ${quota.retryAfter} seconds.`)
  return result.officer
}

const recordKey = z.object({
  jurisdiction: z.string().length(2).transform((v) => v.toUpperCase()),
  recordType: z.string().regex(/^[a-z0-9_]{2,40}$/),
  referenceKind: z.string().regex(/^[a-z0-9_]{2,40}$/),
  reference: z.string().trim().min(3).max(80),
})
const audience = z.enum(AUDIENCES)

async function findProjection(organizationId: string, key: z.infer<typeof recordKey>) {
  const [row] = await db
    .select()
    .from(recordProjection)
    .where(and(eq(recordProjection.organizationId, organizationId), eq(recordProjection.jurisdiction, key.jurisdiction), eq(recordProjection.recordType, key.recordType), eq(recordProjection.referenceKind, key.referenceKind), eq(recordProjection.reference, normaliseReference(key.reference))))
  return row
}

/** Project a record: the institution lists every field it sends AND the audience each field is for. A field
 * with no audience is refused rather than guessed, so nothing is disclosed by omission. */
handlers['records/publish'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device
      .extend({
        ...recordKey.shape,
        fields: z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).refine((o) => Object.keys(o).length >= 1 && Object.keys(o).length <= 40, 'one to forty fields'),
        // For each field the audiences it is for, exactly: one name or a list. "public" means anyone.
        fieldPolicy: z.record(z.string(), z.union([audience, z.array(audience).min(1).max(5)])),
        status: z.enum(STATUSES).default('published'),
        statusNote: z.string().trim().max(200).optional(),
        sourceUpdatedAt: z.number().int().positive(),
      })
      .parse(body)
    const row = await licensedComputer(request, input)
    const officer = await officerFor(request, row, 'publish')
    const missing = Object.keys(input.fields).filter((name) => !(name in input.fieldPolicy))
    const stray = Object.keys(input.fieldPolicy).filter((name) => !(name in input.fields))
    if (missing.length || stray.length) throw new ApiError(422, 'policy_incomplete', `Every field needs an audience, and every audience a field. Without an audience: ${missing.join(', ') || 'none'}. Without a field: ${stray.join(', ') || 'none'}.`)
    const violations = policyViolations(await policyFor(row.organizationId!, input), input.fields, input.fieldPolicy as Record<string, string | string[]>)
    if (violations.length) throw new ApiError(403, 'not_permitted_by_policy', violations.join('. '))
    const existing = await findProjection(row.organizationId!, input)
    const values = {
      displayReference: input.reference,
      status: input.status,
      statusNote: input.statusNote ?? null,
      fields: JSON.stringify(input.fields),
      fieldPolicy: JSON.stringify(input.fieldPolicy),
      sourceUpdatedAt: new Date(input.sourceUpdatedAt),
      updatedAt: now(),
      computerId: row.id,
    }
    if (existing) {
      await db.update(recordProjection).set({ ...values, version: existing.version + 1, supersededByReference: null }).where(eq(recordProjection.id, existing.id))
      await adminEvent({ organizationId: row.organizationId!, actor: `officer:${officer.id}`, actorName: officer.name, action: 'record_published', subject: existing.id, detail: `${input.recordType}/${input.referenceKind}, version ${existing.version + 1}, ${Object.keys(input.fields).length} fields` })
      return { ok: true, id: existing.id, version: existing.version + 1 }
    }
    const id = crypto.randomUUID()
    await db.insert(recordProjection).values({ id, organizationId: row.organizationId!, jurisdiction: input.jurisdiction, recordType: input.recordType, referenceKind: input.referenceKind, reference: normaliseReference(input.reference), ...values })
    await adminEvent({ organizationId: row.organizationId!, actor: `officer:${officer.id}`, actorName: officer.name, action: 'record_published', subject: id, detail: `${input.recordType}/${input.referenceKind}, version 1, ${Object.keys(input.fields).length} fields` })
    return { ok: true, id, version: 1 }
  },
}

/** Withdraw, correct, supersede or seal a projected record. Sealing removes it from everyone but the institution at once. */
handlers['records/status'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ ...recordKey.shape, status: z.enum(STATUSES), note: z.string().trim().max(200).optional(), supersededByReference: z.string().trim().min(3).max(80).optional() }).parse(body)
    const row = await licensedComputer(request, input)
    const officer = await officerFor(request, row, 'publish')
    const existing = await findProjection(row.organizationId!, input)
    if (!existing) throw new ApiError(404, 'unknown_record', 'This institution has not projected that record.')
    if (input.status === 'superseded') {
      if (!input.supersededByReference) throw new ApiError(422, 'replacement_needed', 'Say which record replaces it.')
      const next = await findProjection(row.organizationId!, { ...input, reference: input.supersededByReference })
      if (!next) throw new ApiError(422, 'unknown_replacement', 'The replacing record is not one this institution has projected.')
    }
    await db.update(recordProjection).set({ status: input.status, statusNote: input.note ?? null, supersededByReference: input.status === 'superseded' ? input.supersededByReference!.trim() : null, updatedAt: now() }).where(eq(recordProjection.id, existing.id))
    await adminEvent({ organizationId: row.organizationId!, actor: `officer:${officer.id}`, actorName: officer.name, action: 'record_status_changed', subject: existing.id, detail: input.status })
    return { ok: true }
  },
}

/** Register a credential for the records API. The secret is shown ONCE; only its hash is kept. Registering grants nothing. */
handlers['records/credentials'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ name: z.string().trim().min(2).max(80), kind: z.enum(['application', 'lawyer', 'institution']), days: z.number().int().min(1).max(365).default(90) }).parse(body)
    const row = await licensedComputer(request, input)
    const officer = await officerFor(request, row, 'credentials')
    const secret = `plr_${b64url(crypto.getRandomValues(new Uint8Array(32)))}`
    const id = crypto.randomUUID()
    await db.insert(recordCredential).values({ id, organizationId: row.organizationId!, name: input.name, kind: input.kind, secretHash: await sha256Of(new TextEncoder().encode(secret)), hint: secret.slice(-4), createdAt: now(), expiresAt: new Date(Date.now() + input.days * 86_400_000) })
    await adminEvent({ organizationId: row.organizationId!, actor: `officer:${officer.id}`, actorName: officer.name, action: 'credential_registered', subject: id, detail: `${input.kind}: ${input.name}; ${input.days} days` })
    return { ok: true, id, secret, expiresInDays: input.days, note: 'Keep the secret now. It cannot be shown again, and this credential sees only what an institution grants it.' }
  },
}

handlers['records/credentials/revoke'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ id: z.string().uuid() }).parse(body)
    const row = await licensedComputer(request, input)
    const officer = await officerFor(request, row, 'credentials')
    const [found] = await db.select({ id: recordCredential.id }).from(recordCredential).where(and(eq(recordCredential.id, input.id), eq(recordCredential.organizationId, row.organizationId!)))
    if (!found) throw new ApiError(404, 'unknown_credential', 'No credential of this institution has that id.')
    await db.update(recordCredential).set({ revokedAt: now() }).where(eq(recordCredential.id, input.id))
    await adminEvent({ organizationId: row.organizationId!, actor: `officer:${officer.id}`, actorName: officer.name, action: 'credential_revoked', subject: input.id })
    return { ok: true }
  },
}

/** An institution lets one credential see more of ITS OWN records, for a time. Lawyers and parties must be named as verified. */
handlers['records/grants'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device
      .extend({
        credentialId: z.string().uuid(),
        level: audience.exclude(['public']),
        recordType: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(),
        record: recordKey.optional(),
        /** What was checked, in the officer's words (for a lawyer: the roll or certificate seen). WHO checked is the officer, taken from their secret, never from this body. */
        verification: z.string().trim().min(3).max(200).optional(),
        note: z.string().trim().max(200).optional(),
        days: z.number().int().min(1).max(180).default(30),
      })
      .parse(body)
    const row = await licensedComputer(request, input)
    const officer = await officerFor(request, row, 'approve')
    const [target] = await db.select({ id: recordCredential.id, revokedAt: recordCredential.revokedAt, expiresAt: recordCredential.expiresAt }).from(recordCredential).where(eq(recordCredential.id, input.credentialId))
    if (!target || target.revokedAt || target.expiresAt <= now()) throw new ApiError(404, 'unknown_credential', 'No usable credential has that id.')
    if ((input.level === 'lawyer' || input.level === 'party') && !input.verification) throw new ApiError(422, 'verification_needed', 'A lawyer or a party is granted access only after they have been verified. Say what you checked; you are recorded as the person who verified them.')
    let projectionId: string | null = null
    if (input.record) {
      const found = await findProjection(row.organizationId!, input.record)
      if (!found) throw new ApiError(404, 'unknown_record', 'This institution has not projected that record.')
      projectionId = found.id
    }
    if (input.level === 'party' && !projectionId) throw new ApiError(422, 'record_needed', 'A represented party is granted one record, not a type of record.')
    const id = crypto.randomUUID()
    const at = now()
    await db.insert(recordGrant).values({ id, issuerOrganizationId: row.organizationId!, credentialId: input.credentialId, level: input.level, recordType: input.recordType ?? null, projectionId, verifiedBy: input.verification ? `${officer.name} (${officer.id}): ${input.verification}` : null, verifiedAt: input.verification ? at : null, note: input.note ?? null, createdAt: at, expiresAt: new Date(at.getTime() + input.days * 86_400_000) })
    await adminEvent({ organizationId: row.organizationId!, actor: `officer:${officer.id}`, actorName: officer.name, action: 'grant_approved', subject: id, detail: `${input.level} to credential ${input.credentialId}; ${input.days} days${input.verification ? `; verified: ${input.verification}` : ''}` })
    return { ok: true, id, expiresInDays: input.days }
  },
}

handlers['records/grants/revoke'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ id: z.string().uuid() }).parse(body)
    const row = await licensedComputer(request, input)
    const officer = await officerFor(request, row, 'revoke')
    const [found] = await db.select({ id: recordGrant.id }).from(recordGrant).where(and(eq(recordGrant.id, input.id), eq(recordGrant.issuerOrganizationId, row.organizationId!)))
    if (!found) throw new ApiError(404, 'unknown_grant', 'This institution made no grant with that id.')
    await db.update(recordGrant).set({ revokedAt: now() }).where(eq(recordGrant.id, input.id))
    await adminEvent({ organizationId: row.organizationId!, actor: `officer:${officer.id}`, actorName: officer.name, action: 'grant_revoked', subject: input.id })
    return { ok: true }
  },
}

/** Who looked at this institution's records: the audit the institution can read. References are hashes; no field values. */
handlers['records/access'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ limit: z.number().int().min(1).max(200).default(50) }).parse(body)
    const row = await licensedComputer(request, input)
    await officerFor(request, row, 'audit')
    const rows = await db.select().from(recordAccess).where(eq(recordAccess.issuerOrganizationId, row.organizationId!)).orderBy(desc(recordAccess.at)).limit(input.limit)
    return { ok: true, access: rows.map((r) => ({ at: r.at.getTime(), credentialId: r.credentialId, outcome: r.outcome, audience: r.audience, referenceHash: r.referenceHash, fieldsReturned: r.fieldsReturned })) }
  },
}

/** Only the institution that made a tracking code may stop or resume publishing it. */
handlers['track/publication'] = {
  method: 'POST',
  run: async (request, body) => {
    const input = device.extend({ code: z.string().transform(normaliseCode).pipe(z.string().length(12)), published: z.boolean() }).parse(body)
    const row = await licensedComputer(request, input)
    const [existing] = await db.select().from(trackingCode).where(and(eq(trackingCode.code, input.code), eq(trackingCode.organizationId, row.organizationId!)))
    if (!existing) throw new ApiError(404, 'unknown_code', 'No case of this institution has this tracking code.')
    await db.update(trackingCode).set({ unpublishedAt: input.published ? null : now() }).where(eq(trackingCode.code, input.code))
    return { ok: true, published: input.published }
  },
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
