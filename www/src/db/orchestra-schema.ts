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
    // SHA-256 of the secret handed to the app when it activated a licence; the
    // app shows it on every later call that speaks for its institution.
    tokenHash: text('token_hash'),
    // The computer's seal public key (base64url X25519): storage secrets are
    // sealed to it in an administrator's browser (ORCHESTRA-BACKUP.md).
    sealKey: text('seal_key'),
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
    storageId: text('storage_id'),
    sizeBytes: integer('size_bytes'),
    ok: integer('ok', { mode: 'boolean' }).notNull(),
    message: text('message'),
  },
  (t) => [index('backup_report_org').on(t.organizationId, t.at)],
)

/** The public half of an institution's backup key. Its secret half is the
 * recovery phrase the institution wrote down; Pleadli never sees it. */
export const backupKey = sqliteTable('backup_key', {
  organizationId: text('organization_id').primaryKey().references(() => organization.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  fingerprint: text('fingerprint').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
})

/** The institution's own backup storage. `settings` holds only what is not
 * secret (endpoint, bucket, path, user name); the secret is in storageSeal. */
export const storageTarget = sqliteTable('storage_target', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  kind: text('kind').notNull(), // s3 | folder | sftp
  settings: text('settings').notNull(), // JSON
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** A computer's access to one storage: the secret, sealed in an
 * administrator's browser to that computer's seal key. Present means approved. */
export const storageSeal = sqliteTable(
  'storage_seal',
  {
    storageId: text('storage_id').notNull().references(() => storageTarget.id, { onDelete: 'cascade' }),
    computerId: text('computer_id').notNull().references(() => computer.id, { onDelete: 'cascade' }),
    sealed: text('sealed'), // null for a storage with no secret (a folder)
    sealedAt: integer('sealed_at', { mode: 'timestamp_ms' }).notNull(),
    sealedBy: text('sealed_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('storage_seal_pair').on(t.storageId, t.computerId)],
)

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

/** The fingerprint of a paper an app issued (charge sheet, bond, order): its
 * verification code, reference, kind, issuing office and date, and hashes of
 * the content. Never the content. Read by the public pleadli.com/verify page. */
export const paper = sqliteTable(
  'paper',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    reference: text('reference').notNull(),
    kind: text('kind').notNull(),
    application: text('application').notNull(),
    organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
    office: text('office').notNull(), // the issuing office's Orchestra address
    computerId: text('computer_id').references(() => computer.id, { onDelete: 'set null' }),
    contentSha256: text('content_sha256').notNull(),
    fileSha256: text('file_sha256'), // the exported PDF, when the app sent one
    issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
    withdrawnAt: integer('withdrawn_at', { mode: 'timestamp_ms' }),
    withdrawnReason: text('withdrawn_reason'),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('paper_org').on(t.organizationId, t.issuedAt)],
)

/** A code given to the person concerned in a case (on a receipt or a bond) to
 * follow its stage on pleadli.com/track, like a parcel. Holds no names. */
export const trackingCode = sqliteTable('tracking_code', {
  code: text('code').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  computerId: text('computer_id').references(() => computer.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/** One step of a tracked case: a stage from a fixed list, the office it is
 * with, and the next date if there is one. A fixed list keeps names out. */
export const trackingEvent = sqliteTable(
  'tracking_event',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().references(() => trackingCode.code, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    office: text('office'), // Orchestra address of the office the case is with
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    nextAt: integer('next_at', { mode: 'timestamp_ms' }),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('tracking_event_code').on(t.code, t.at)],
)
