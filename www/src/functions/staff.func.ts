import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { backupReport, computer, licence, licenceRequest, orchestraMember, supportReport } from '@/db/orchestra-schema'
import { ADDRESS_PATTERN, APPLICATIONS, DAY, TRIAL_DAYS, newLicenceKey, sha256Hex, slugPart, suggestAddress } from '@/lib/orchestra'
import { AdminMiddleware } from '@/middlewares/admin'
import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte } from 'drizzle-orm'
import * as z from 'zod'

/** The figures Pleadli staff watch: who is waiting, how many computers run
 * each app, trials and licences, and what needs an answer. */
export const getStaffOverview = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const now = Date.now()
    const [orgs, computers, licences, requests, reports, failedBackups] = await Promise.all([
      db.select({ id: organization.id, name: organization.name, status: organization.status, kind: organization.kind, institutionType: organization.institutionType, country: organization.country, requestedAt: organization.requestedAt }).from(organization),
      db.select({ application: computer.application, lastSeenAt: computer.lastSeenAt, trialStartedAt: computer.trialStartedAt, licenceId: computer.licenceId, version: computer.version, country: computer.country }).from(computer),
      db.select({ status: licence.status, expiresAt: licence.expiresAt, seats: licence.seats, application: licence.application }).from(licence),
      db.select({ id: licenceRequest.id }).from(licenceRequest).where(eq(licenceRequest.status, 'open')),
      db.select({ id: supportReport.id, kind: supportReport.kind }).from(supportReport).where(eq(supportReport.status, 'open')),
      db.select({ id: backupReport.id }).from(backupReport).where(and(eq(backupReport.ok, false), gte(backupReport.at, new Date(now - 7 * DAY)))),
    ])
    const seenWithin = (days: number) => computers.filter((c) => c.lastSeenAt.getTime() >= now - days * DAY).length
    const byApp = Object.fromEntries(APPLICATIONS.map((a) => [a, computers.filter((c) => c.application === a && c.lastSeenAt.getTime() >= now - 30 * DAY).length]))
    const unlicensed = computers.filter((c) => !c.licenceId)
    const trialEnds = (c: { trialStartedAt: Date }) => c.trialStartedAt.getTime() + TRIAL_DAYS * DAY
    return {
      waiting: orgs.filter((o) => o.status === 'pending').sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0)),
      institutions: { active: orgs.filter((o) => o.status === 'active').length, pending: orgs.filter((o) => o.status === 'pending').length, practices: orgs.filter((o) => o.kind === 'practice' && o.status === 'active').length },
      computers: { today: seenWithin(1), week: seenWithin(7), month: seenWithin(30), total: computers.length, byApp },
      trials: { running: unlicensed.filter((c) => trialEnds(c) > now).length, ended: unlicensed.filter((c) => trialEnds(c) <= now).length },
      licences: { active: licences.filter((l) => l.status === 'active' && l.expiresAt.getTime() > now).length, expiringSoon: licences.filter((l) => l.status === 'active' && l.expiresAt.getTime() > now && l.expiresAt.getTime() < now + 30 * DAY).length },
      openRequests: requests.length,
      openReports: reports.length,
      crashes: reports.filter((r) => r.kind === 'crash').length,
      failedBackups: failedBackups.length,
    }
  })

export const listInstitutionsStaff = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const [orgs, units, owners] = await Promise.all([
      db.select().from(organization).orderBy(desc(organization.requestedAt)),
      db.select({ id: organizationUnit.id, organizationId: organizationUnit.organizationId, name: organizationUnit.name, kind: organizationUnit.kind, district: organizationUnit.district, address: organizationUnit.address }).from(organizationUnit),
      db.select({ organizationId: orchestraMember.organizationId, email: orchestraMember.email }).from(orchestraMember).where(eq(orchestraMember.role, 'owner')),
    ])
    return orgs.map((o) => ({
      ...o,
      offices: units.filter((u) => u.organizationId === o.id),
      owner: owners.find((w) => w.organizationId === o.id)?.email ?? null,
      suggestedAddress: o.address ?? suggestAddress(o.country, o.institutionType, o.name),
    }))
  })

const approveSchema = z.object({ organizationId: z.string().min(1), address: z.string().trim().toLowerCase().regex(ADDRESS_PATTERN, 'An address reads country.institution.place, for example ug.police.albertine.') })

/** Staff confirm an institution is genuine and issue its address, and an
 * address under it for each of its offices. Addresses never change after this. */
export const approveInstitution = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(approveSchema)
  .handler(async ({ data, context }) => {
    const [org] = await db.select().from(organization).where(eq(organization.id, data.organizationId))
    if (!org) throw new Error('No such institution.')
    if (org.address) throw new Error('This institution already has its address.')
    const taken = await db.select({ id: organization.id }).from(organization).where(eq(organization.address, data.address))
    if (taken.length) throw new Error('That address is already issued.')
    await db.update(organization).set({ status: 'active', address: data.address, reviewedAt: new Date(), reviewedBy: context.session.user.email, reviewNote: null }).where(eq(organization.id, org.id))
    const units = await db.select().from(organizationUnit).where(eq(organizationUnit.organizationId, org.id))
    const used = new Set<string>()
    for (const unit of units) {
      if (unit.address) continue
      let address = `${data.address}.${slugPart(unit.name)}`
      for (let n = 2; used.has(address); n++) address = `${data.address}.${slugPart(unit.name)}-${n}`
      used.add(address)
      await db.update(organizationUnit).set({ address }).where(eq(organizationUnit.id, unit.id))
    }
    return { ok: true }
  })

const declineSchema = z.object({ organizationId: z.string().min(1), note: z.string().trim().min(3).max(1000) })

export const declineInstitution = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(declineSchema)
  .handler(async ({ data, context }) => {
    await db.update(organization).set({ status: 'declined', reviewedAt: new Date(), reviewedBy: context.session.user.email, reviewNote: data.note }).where(and(eq(organization.id, data.organizationId), eq(organization.status, 'pending')))
    return { ok: true }
  })

const suspendSchema = z.object({ organizationId: z.string().min(1), suspended: z.boolean(), note: z.string().trim().max(1000).optional() })

export const setInstitutionSuspended = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(suspendSchema)
  .handler(async ({ data, context }) => {
    await db.update(organization).set({ status: data.suspended ? 'suspended' : 'active', reviewedAt: new Date(), reviewedBy: context.session.user.email, reviewNote: data.note || null }).where(eq(organization.id, data.organizationId))
    return { ok: true }
  })

const issueSchema = z.object({ organizationId: z.string().min(1), application: z.enum(APPLICATIONS), seats: z.number().int().min(1).max(5000), months: z.number().int().min(1).max(60), note: z.string().trim().max(500).optional(), requestId: z.string().optional() })

/** Issues a licence and returns its key once; afterwards only its last four
 * characters are kept to recognise it. */
export const issueLicence = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(issueSchema)
  .handler(async ({ data, context }) => {
    const [org] = await db.select().from(organization).where(eq(organization.id, data.organizationId))
    if (!org || org.status !== 'active') throw new Error('Licences are issued to approved institutions only.')
    const key = newLicenceKey()
    const now = new Date()
    const expires = new Date(now)
    expires.setMonth(expires.getMonth() + data.months)
    await db.insert(licence).values({ id: crypto.randomUUID(), organizationId: org.id, application: data.application, seats: data.seats, startsAt: now, expiresAt: expires, status: 'active', keyHash: await sha256Hex(key), keyHint: key.slice(-4), issuedBy: context.session.user.email, note: data.note || null, createdAt: now })
    if (data.requestId) await db.update(licenceRequest).set({ status: 'done', handledAt: now, handledBy: context.session.user.email }).where(eq(licenceRequest.id, data.requestId))
    return { key }
  })

export const revokeLicence = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(z.object({ licenceId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await db.update(licence).set({ status: 'revoked' }).where(eq(licence.id, data.licenceId))
    return { ok: true }
  })

export const listLicencesStaff = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const [rows, orgs, requests, computers] = await Promise.all([
      db.select({ id: licence.id, organizationId: licence.organizationId, application: licence.application, seats: licence.seats, startsAt: licence.startsAt, expiresAt: licence.expiresAt, status: licence.status, keyHint: licence.keyHint, issuedBy: licence.issuedBy, note: licence.note }).from(licence).orderBy(desc(licence.createdAt)),
      db.select({ id: organization.id, name: organization.name, status: organization.status, address: organization.address }).from(organization),
      db.select().from(licenceRequest).orderBy(desc(licenceRequest.createdAt)),
      db.select({ licenceId: computer.licenceId }).from(computer),
    ])
    const name = (id: string) => orgs.find((o) => o.id === id)?.name ?? '?'
    return {
      licences: rows.map((l) => ({ ...l, institution: name(l.organizationId), used: computers.filter((c) => c.licenceId === l.id).length })),
      requests: requests.map((r) => ({ ...r, institution: name(r.organizationId) })),
      institutions: orgs.filter((o) => o.status === 'active'),
    }
  })

export const closeLicenceRequest = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(z.object({ requestId: z.string().min(1), status: z.enum(['done', 'declined']) }))
  .handler(async ({ data, context }) => {
    await db.update(licenceRequest).set({ status: data.status, handledAt: new Date(), handledBy: context.session.user.email }).where(eq(licenceRequest.id, data.requestId))
    return { ok: true }
  })

export const listComputersStaff = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const [rows, orgs] = await Promise.all([
      db.select().from(computer).orderBy(desc(computer.lastSeenAt)).limit(1000),
      db.select({ id: organization.id, name: organization.name }).from(organization),
    ])
    return rows.map((c) => ({ ...c, institution: c.organizationId ? (orgs.find((o) => o.id === c.organizationId)?.name ?? null) : null }))
  })

export const listReportsStaff = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const [rows, orgs] = await Promise.all([
      db.select().from(supportReport).orderBy(desc(supportReport.createdAt)).limit(500),
      db.select({ id: organization.id, name: organization.name }).from(organization),
    ])
    return rows.map((r) => ({ ...r, institution: r.organizationId ? (orgs.find((o) => o.id === r.organizationId)?.name ?? null) : null }))
  })

export const replyToReport = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(z.object({ reportId: z.string().min(1), reply: z.string().trim().max(5000).optional(), status: z.enum(['answered', 'closed']) }))
  .handler(async ({ data, context }) => {
    await db.update(supportReport).set({ status: data.status, reply: data.reply || null, repliedAt: new Date(), repliedBy: context.session.user.email }).where(eq(supportReport.id, data.reportId))
    return { ok: true }
  })
