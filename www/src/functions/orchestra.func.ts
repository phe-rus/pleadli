import { db } from '@/db'
import { organization, organizationUnit } from '@/db/auth-schema'
import { backupKey, backupReport, computer, licence, licenceRequest, orchestraMember, storageSeal, storageTarget, supportReport } from '@/db/orchestra-schema'
import { APPLICATIONS, slugPart } from '@/lib/orchestra'
import { SessionMiddleware } from '@/middlewares/session'
import { INSTITUTION_TYPES } from '@pleadli/templates'
import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray } from 'drizzle-orm'
import * as z from 'zod'
import { memberOf, myMemberships, requireUser } from './members'

export const getMyOrchestra = createServerFn({ method: 'GET' })
  .middleware([SessionMiddleware])
  .handler(async ({ context }) => {
    const user = requireUser(context.session)
    const memberships = await myMemberships(user)
    if (!memberships.length) return { user: { name: (context.session!.user as { name: string }).name, email: user.email }, institutions: [] }
    const orgs = await db.select().from(organization).where(inArray(organization.id, memberships.map((m) => m.organizationId)))
    return {
      user: { name: (context.session!.user as { name: string }).name, email: user.email },
      institutions: orgs.map((o) => ({ ...o, role: memberships.find((m) => m.organizationId === o.id)!.role })),
    }
  })

const registerSchema = z.object({
  kind: z.enum(['institution', 'practice']),
  institutionType: z.enum([...INSTITUTION_TYPES] as [string, ...string[]]),
  name: z.string().trim().min(2).max(120),
  country: z.string().length(2),
  district: z.string().trim().max(80).optional(),
  contactEmail: z.string().trim().email(),
  contactPhone: z.string().trim().min(6).max(30),
  offices: z.array(z.object({ name: z.string().trim().min(2).max(120), kind: z.string(), district: z.string().trim().max(80).optional() })).max(200).default([]),
})

/** A registration is a request: the institution and its first offices are
 * recorded as waiting, and Pleadli staff check them before any address is issued. */
export const registerInstitution = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(registerSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    if (data.kind === 'practice' && data.institutionType !== 'lawyers') throw new Error('A practice is an advocate or a law firm.')
    if (data.kind === 'institution' && data.institutionType === 'lawyers') throw new Error('Advocates and firms register as a practice.')
    const id = crypto.randomUUID()
    const now = new Date()
    await db.insert(organization).values({
      id,
      name: data.name,
      slug: `${slugPart(data.name) || 'institution'}-${id.slice(0, 6)}`,
      institutionType: data.institutionType,
      kind: data.kind,
      country: data.country.toUpperCase(),
      district: data.district || null,
      contactEmail: data.contactEmail.toLowerCase(),
      contactPhone: data.contactPhone,
      status: 'pending',
      requestedAt: now,
    })
    for (const office of data.offices) {
      await db.insert(organizationUnit).values({ id: crypto.randomUUID(), organizationId: id, parentId: null, name: office.name, kind: office.kind, district: office.district || null })
    }
    await db.insert(orchestraMember).values({ id: crypto.randomUUID(), organizationId: id, userId: user.id, email: user.email.toLowerCase(), role: 'owner', status: 'active', invitedAt: now, joinedAt: now })
    return { id }
  })

const orgIdSchema = z.object({ organizationId: z.string().min(1) })

/** Everything one institution sees about itself on /orchestra. */
export const getInstitution = createServerFn({ method: 'GET' })
  .middleware([SessionMiddleware])
  .validator(orgIdSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    const me = await memberOf(user, data.organizationId)
    const [org] = await db.select().from(organization).where(eq(organization.id, data.organizationId))
    const [offices, licences, computers, backups, members, requests, reports, storage, [key], seals] = await Promise.all([
      db.select().from(organizationUnit).where(eq(organizationUnit.organizationId, data.organizationId)),
      db
        .select({ id: licence.id, application: licence.application, seats: licence.seats, startsAt: licence.startsAt, expiresAt: licence.expiresAt, status: licence.status, keyHint: licence.keyHint })
        .from(licence)
        .where(eq(licence.organizationId, data.organizationId)),
      db.select().from(computer).where(eq(computer.organizationId, data.organizationId)),
      db.select().from(backupReport).where(eq(backupReport.organizationId, data.organizationId)).orderBy(desc(backupReport.at)).limit(200),
      db.select().from(orchestraMember).where(eq(orchestraMember.organizationId, data.organizationId)),
      db.select().from(licenceRequest).where(eq(licenceRequest.organizationId, data.organizationId)).orderBy(desc(licenceRequest.createdAt)),
      db.select().from(supportReport).where(eq(supportReport.organizationId, data.organizationId)).orderBy(desc(supportReport.createdAt)).limit(100),
      db.select().from(storageTarget).where(eq(storageTarget.organizationId, data.organizationId)),
      db.select().from(backupKey).where(eq(backupKey.organizationId, data.organizationId)),
      db
        .select({ storageId: storageSeal.storageId, computerId: storageSeal.computerId, sealedAt: storageSeal.sealedAt })
        .from(storageSeal)
        .innerJoin(storageTarget, eq(storageTarget.id, storageSeal.storageId))
        .where(eq(storageTarget.organizationId, data.organizationId)),
    ])
    return {
      role: me.role,
      institution: org,
      offices,
      licences,
      // The token hash stays on the server; the seal key is public by design.
      computers: computers.map(({ tokenHash: _, ...c }) => c),
      backups,
      members,
      requests,
      reports,
      storage: storage.map((s) => ({ ...s, settings: JSON.parse(s.settings) as Record<string, string | number> })),
      backupKey: key ? { publicKey: key.publicKey, fingerprint: key.fingerprint, createdAt: key.createdAt } : null,
      seals,
    }
  })

const officeSchema = z.object({ organizationId: z.string().min(1), name: z.string().trim().min(2).max(120), kind: z.string().min(1), district: z.string().trim().max(80).optional() })

/** An office under the institution. Once the institution has its address, the
 * office gets its own under it (ug.police.albertine.kagadi). */
export const addOffice = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(officeSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    const [org] = await db.select().from(organization).where(eq(organization.id, data.organizationId))
    const address = org.address ? `${org.address}.${slugPart(data.name)}` : null
    if (address) {
      const taken = await db.select({ id: organizationUnit.id }).from(organizationUnit).where(eq(organizationUnit.address, address))
      if (taken.length) throw new Error('Another office already has that address. Give this office a more particular name.')
    }
    await db.insert(organizationUnit).values({ id: crypto.randomUUID(), organizationId: data.organizationId, parentId: null, name: data.name, kind: data.kind, district: data.district || null, address })
    return { ok: true }
  })

const inviteSchema = z.object({ organizationId: z.string().min(1), email: z.string().trim().email() })

/** The owner invites an administrator by email; they become active when they
 * sign in to pleadli.com with that address. */
export const inviteAdministrator = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(inviteSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId, true)
    const email = data.email.toLowerCase()
    const existing = await db.select().from(orchestraMember).where(and(eq(orchestraMember.organizationId, data.organizationId), eq(orchestraMember.email, email)))
    if (existing.length) throw new Error('That address is already invited.')
    await db.insert(orchestraMember).values({ id: crypto.randomUUID(), organizationId: data.organizationId, userId: null, email, role: 'admin', status: 'invited', invitedAt: new Date() })
    return { ok: true }
  })

const removeSchema = z.object({ organizationId: z.string().min(1), memberId: z.string().min(1) })

export const removeAdministrator = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(removeSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId, true)
    await db.delete(orchestraMember).where(and(eq(orchestraMember.id, data.memberId), eq(orchestraMember.organizationId, data.organizationId), eq(orchestraMember.role, 'admin')))
    return { ok: true }
  })

const requestSchema = z.object({ organizationId: z.string().min(1), application: z.enum(APPLICATIONS), seats: z.number().int().min(1).max(5000), message: z.string().trim().max(2000).optional() })

/** "We would like a licence", until online payment opens. */
export const requestLicence = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(requestSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    await db.insert(licenceRequest).values({ id: crypto.randomUUID(), organizationId: data.organizationId, application: data.application, seats: data.seats, message: data.message || null, status: 'open', createdAt: new Date() })
    return { ok: true }
  })

const helpSchema = z.object({ organizationId: z.string().min(1), application: z.enum(APPLICATIONS).optional(), title: z.string().trim().min(3).max(160), body: z.string().trim().min(3).max(5000) })

export const writeToPleadli = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(helpSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    await db.insert(supportReport).values({ id: crypto.randomUUID(), kind: 'question', application: data.application ?? null, version: null, computerId: null, organizationId: data.organizationId, title: data.title, body: data.body, status: 'open', createdAt: new Date() })
    return { ok: true }
  })
