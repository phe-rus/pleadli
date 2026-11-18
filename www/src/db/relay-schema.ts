import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { organization } from './auth-schema'

/** The postbox relay (docs/platform/RELAY-DESIGN.md): three tables. The relay
 * only ever holds sealed bytes in R2 and these small rows in D1; it never
 * reads a package. */

/** One row per office address that can receive mail. Keys, certificate and
 * directory entry are one row (RELAY-DESIGN.md section 4). Not used by the
 * skeleton yet: certificates and the directory come in build steps 2 and 3. */
export const relayOffice = sqliteTable('relay_office', {
  address: text('address').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  ed25519Pub: text('ed25519_pub'),
  x25519Pub: text('x25519_pub'),
  certificate: text('certificate', { mode: 'json' }),
  relay: text('relay'),
  name: text('name'),
  area: text('area'),
  kind: text('kind'), // station | office | court | facility | chambers
  accepts: text('accepts', { mode: 'json' }),
  listed: integer('listed', { mode: 'boolean' }).default(false).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

/** The introduction between two offices, decided by a person (build step 2). */
export const relayLink = sqliteTable(
  'relay_link',
  {
    id: text('id').primaryKey(),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    status: text('status').notNull(), // requested | approved | declined | revoked
    requestedBy: text('requested_by'),
    decidedBy: text('decided_by'),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
  },
  (t) => [uniqueIndex('relay_link_pair').on(t.fromAddress, t.toAddress)],
)

/** The envelope, never the letter. The id is the package id, so a retry is
 * idempotent. The bytes are in R2 at `blob_key` until collected or expired. */
export const relayMessage = sqliteTable(
  'relay_message',
  {
    id: text('id').primaryKey(),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    kind: text('kind').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    blobKey: text('blob_key').notNull(),
    postedAt: integer('posted_at', { mode: 'timestamp_ms' }).notNull(),
    deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
    ackedAt: integer('acked_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('relay_message_to').on(t.toAddress, t.postedAt), index('relay_message_from').on(t.fromAddress, t.postedAt)],
)
