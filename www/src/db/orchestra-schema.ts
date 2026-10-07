import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { organization, organizationUnit, user } from './auth-schema'

/** The people who manage an institution or practice on pleadli.com: the owner
 * who registered it, and the administrators the owner invites. Officers never
 * need an account here; they sign in to their office's app. */
export const orchestraMember = sqliteTable(
  'orchestra_member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(), // owner | admin
    status: text('status').notNull(), // invited | active
    invitedAt: integer('invited_at', { mode: 'timestamp_ms' }).notNull(),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }),
  },
  (t) => [uniqueIndex('orchestra_member_org_email').on(t.organizationId, t.email)],
)

/** A licence for one application, for so many computers, until a date. The
 * key is shown once when issued; only its hash and last four characters stay. */
export const licence = sqliteTable(
  'licence',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    application: text('application').notNull(),
    seats: integer('seats').notNull(),
    startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    status: text('status').notNull(), // active | revoked
    keyHash: text('key_hash').notNull().unique(),
    keyHint: text('key_hint').notNull(),
    issuedBy: text('issued_by'),
    note: text('note'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('licence_org').on(t.organizationId)],
)

/** "We would like a licence": made from /orchestra until online payment opens,
 * answered by Pleadli staff, who then issue the licence. */
export const licenceRequest = sqliteTable('licence_request', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  application: text('application').notNull(),
  seats: integer('seats').notNull(),
  message: text('message'),
  status: text('status').notNull(), // open | done | declined
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  handledAt: integer('handled_at', { mode: 'timestamp_ms' }),
  handledBy: text('handled_by'),
})

/** One computer running one Pleadli app, known by a hash of its machine
 * identifier (never the identifier itself). Holds when its trial started, so a
 * reinstall continues the same 30 days, and when it was last seen. */
export const computer = sqliteTable(
  'computer',
  {
    id: text('id').primaryKey(),
    deviceHash: text('device_hash').notNull(),
    application: text('application').notNull(),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    unitId: text('unit_id').references(() => organizationUnit.id, { onDelete: 'set null' }),
    licenceId: text('licence_id').references(() => licence.id, { onDelete: 'set null' }),
    version: text('version'),
    os: text('os'),
    country: text('country'),
    trialStartedAt: integer('trial_started_at', { mode: 'timestamp_ms' }).notNull(),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [uniqueIndex('computer_device_app').on(t.deviceHash, t.application), index('computer_org').on(t.organizationId)],
)

/** What an app reports after a backup to the institution's own storage: when,
 * how large, whether it worked. Never the backup itself. */
export const backupReport = sqliteTable(
  'backup_report',
  {
    id: text('id').primaryKey(),
    computerId: text('computer_id').notNull().references(() => computer.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    sizeBytes: integer('size_bytes'),
    ok: integer('ok', { mode: 'boolean' }).notNull(),
    message: text('message'),
  },
  (t) => [index('backup_report_org').on(t.organizationId, t.at)],
)

/** The institution's own backup storage, its access details sealed to the
 * institution's key so that only its apps can open them. */
export const storageTarget = sqliteTable('storage_target', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  kind: text('kind').notNull(), // s3 | network | drive
  sealedConfig: text('sealed_config'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** A crash report, an issue or a question, sent from an app only when someone
 * presses Send, or written on /orchestra. Never carries case data. */
export const supportReport = sqliteTable(
  'support_report',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // crash | issue | question
    application: text('application'),
    version: text('version'),
    computerId: text('computer_id').references(() => computer.id, { onDelete: 'set null' }),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull(), // open | answered | closed
    reply: text('reply'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    repliedAt: integer('replied_at', { mode: 'timestamp_ms' }),
    repliedBy: text('replied_by'),
  },
  (t) => [index('support_report_status').on(t.status, t.createdAt)],
)
