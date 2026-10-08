import { db } from '@/db'
import { backupKey, computer, storageSeal, storageTarget } from '@/db/orchestra-schema'
import { fromBase64url, keyFingerprint, needsSecret } from '@/lib/seal'
import { SessionMiddleware } from '@/middlewares/session'
import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import * as z from 'zod'
import { memberOf, requireUser } from './members'

/** Backups on /orchestra (docs/platform/ORCHESTRA-BACKUP.md). Everything secret
 * is made or sealed in the administrator's browser; these only keep the
 * public key, the plain settings and the seals. */

const key32 = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

/** The public half of the key made from the recovery phrase. Only the owner
 * sets it, and replacing it is said out loud: older backups keep the old phrase. */
export const setBackupKey = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(z.object({ organizationId: z.string().min(1), publicKey: key32, replace: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId, true)
    const [existing] = await db.select().from(backupKey).where(eq(backupKey.organizationId, data.organizationId))
    if (existing && !data.replace) throw new Error('This institution already has a backup key.')
    const row = { publicKey: data.publicKey, fingerprint: keyFingerprint(fromBase64url(data.publicKey)), createdAt: new Date(), createdBy: user.id }
    if (existing) await db.update(backupKey).set(row).where(eq(backupKey.organizationId, data.organizationId))
    else await db.insert(backupKey).values({ organizationId: data.organizationId, ...row })
    return { fingerprint: row.fingerprint }
  })

const text = (max: number) => z.string().trim().min(1).max(max)
const settingsFor = {
  s3: z.object({ endpoint: z.string().trim().url().max(300), region: z.string().trim().max(60).default(''), bucket: text(120), prefix: z.string().trim().max(200).default('') }),
  folder: z.object({ path: text(400) }),
  sftp: z.object({ host: text(255), port: z.number().int().min(1).max(65535).default(22), username: text(120), path: z.string().trim().max(400).default(''), hostKey: text(200) }),
}

const sealsSchema = z.array(z.object({ computerId: z.string().min(1), sealKey: key32, sealed: z.string().max(4000).nullable() })).max(500)

/** Seals made in the browser, kept only for this institution's computers and
 * only for the seal key they were made with (a computer may have a new one). */
async function keepSeals(organizationId: string, storage: { id: string; kind: string }, seals: z.infer<typeof sealsSchema>, userId: string) {
  if (!seals.length) return 0
  const machines = await db.select({ id: computer.id, sealKey: computer.sealKey }).from(computer).where(and(eq(computer.organizationId, organizationId), inArray(computer.id, seals.map((s) => s.computerId))))
  let kept = 0
  for (const s of seals) {
    const machine = machines.find((m) => m.id === s.computerId)
    if (!machine || machine.sealKey !== s.sealKey) continue
    if (needsSecret(storage.kind) !== (s.sealed !== null)) throw new Error('A computer was sent the wrong kind of access.')
    await db.delete(storageSeal).where(and(eq(storageSeal.storageId, storage.id), eq(storageSeal.computerId, s.computerId)))
    await db.insert(storageSeal).values({ storageId: storage.id, computerId: s.computerId, sealed: s.sealed, sealedAt: new Date(), sealedBy: userId })
    kept++
  }
  return kept
}

const storageSchema = z.object({
  organizationId: z.string().min(1),
  // Made in the browser, since the seals name it before the storage exists.
  id: z.string().uuid(),
  label: text(80),
  kind: z.enum(['s3', 'folder', 'sftp']),
  settings: z.record(z.string(), z.unknown()),
  seals: sealsSchema.default([]),
})

/** Adds or changes a storage. A new secret comes with fresh seals for the
 * computers given access; changing only the settings keeps their access. */
export const saveStorage = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(storageSchema)
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    const settings = JSON.stringify(settingsFor[data.kind].parse(data.settings))
    const now = new Date()
    const id = data.id
    const [row] = await db.select().from(storageTarget).where(eq(storageTarget.id, id))
    if (row) {
      if (row.organizationId !== data.organizationId) throw new Error('No such storage.')
      if (row.kind !== data.kind) throw new Error('A storage cannot change kind; add a new one instead.')
      await db.update(storageTarget).set({ label: data.label, settings, updatedAt: now }).where(eq(storageTarget.id, id))
    } else {
      await db.insert(storageTarget).values({ id, organizationId: data.organizationId, label: data.label, kind: data.kind, settings, createdAt: now, updatedAt: now })
    }
    const given = await keepSeals(data.organizationId, { id, kind: data.kind }, data.seals, user.id)
    return { id, given }
  })

export const giveAccess = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(z.object({ organizationId: z.string().min(1), storageId: z.string().min(1), seals: sealsSchema }))
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    const [row] = await db.select().from(storageTarget).where(and(eq(storageTarget.id, data.storageId), eq(storageTarget.organizationId, data.organizationId)))
    if (!row) throw new Error('No such storage.')
    return { given: await keepSeals(data.organizationId, row, data.seals, user.id) }
  })

/** Takes a computer's access away. It may have kept the secret, so the page
 * tells the administrator to change it at the storage. */
export const removeAccess = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(z.object({ organizationId: z.string().min(1), storageId: z.string().min(1), computerId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    const [row] = await db.select().from(storageTarget).where(and(eq(storageTarget.id, data.storageId), eq(storageTarget.organizationId, data.organizationId)))
    if (!row) throw new Error('No such storage.')
    await db.delete(storageSeal).where(and(eq(storageSeal.storageId, data.storageId), eq(storageSeal.computerId, data.computerId)))
    return { ok: true }
  })

export const removeStorage = createServerFn({ method: 'POST' })
  .middleware([SessionMiddleware])
  .validator(z.object({ organizationId: z.string().min(1), storageId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const user = requireUser(context.session)
    await memberOf(user, data.organizationId)
    await db.delete(storageTarget).where(and(eq(storageTarget.id, data.storageId), eq(storageTarget.organizationId, data.organizationId)))
    return { ok: true }
  })
