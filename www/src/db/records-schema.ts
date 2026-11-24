import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization } from "./auth-schema";
import { computer } from "./orchestra-schema";

/** The institution-controlled records API (docs/platform/RECORDS-API.md).
 * The originating institution owns a record and decides who sees which field;
 * pleadli.com keeps only what the institution chose to project, resolves a
 * reference, enforces the disclosure rules on the server, and writes the audit. */

/** What an institution chose to project for one record. A reference (a CRB number, a court file
 * number) is NOT globally unique: the record is found by issuer, jurisdiction, kind and reference. */
export const recordProjection = sqliteTable(
  "record_projection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jurisdiction: text("jurisdiction").notNull(), // ISO country, upper case: "UG"
    recordType: text("record_type").notNull(), // "criminal_case", "civil_case", "charge_sheet", ...
    referenceKind: text("reference_kind").notNull(), // "crb", "court_file", "dpp_file", ...
    reference: text("reference").notNull(), // normalised: upper case, separators removed
    displayReference: text("display_reference").notNull(), // as the institution writes it
    /** published | withdrawn | corrected | superseded | sealed */
    status: text("status").notNull().default("published"),
    statusNote: text("status_note"),
    supersededByReference: text("superseded_by_reference"),
    /** JSON object of field -> value. Only fields the institution chose to project. */
    fields: text("fields").notNull().default("{}"),
    /** JSON object of field -> minimum audience: public | application | lawyer | party | institution.
     * A field with no entry is never disclosed. */
    fieldPolicy: text("field_policy").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    computerId: text("computer_id").references(() => computer.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("record_projection_key").on(t.organizationId, t.jurisdiction, t.recordType, t.referenceKind, t.reference),
    index("record_projection_lookup").on(t.jurisdiction, t.referenceKind, t.reference),
  ],
);

/** An application or person's credential for the records API. Registering one grants NOTHING:
 * what it may see comes only from grants an institution makes to it. Only a hash of the secret is kept. */
export const recordCredential = sqliteTable("record_credential", {
  id: text("id").primaryKey(),
  /** The organisation account that registered it (and answers for it). */
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** application | lawyer | institution: a label the holder chose. It is a CLAIM and decides nothing. */
  kind: text("kind").notNull(),
  secretHash: text("secret_hash").notNull().unique(),
  hint: text("hint").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
});

/** One institution letting one credential see more, explicitly, for a time. */
export const recordGrant = sqliteTable(
  "record_grant",
  {
    id: text("id").primaryKey(),
    /** The institution that owns the records and makes the grant. */
    issuerOrganizationId: text("issuer_organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    credentialId: text("credential_id")
      .notNull()
      .references(() => recordCredential.id, { onDelete: "cascade" }),
    /** application | lawyer | party | institution */
    level: text("level").notNull(),
    /** Limits the grant to one record type; null means every type of this issuer (named on purpose). */
    recordType: text("record_type"),
    /** Limits the grant to one record. Required for a party: a represented party sees their own matter only. */
    projectionId: text("projection_id").references(() => recordProjection.id, { onDelete: "cascade" }),
    /** Who vouched that this holder is a lawyer or party, and when (required for those levels). */
    verifiedBy: text("verified_by"),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("record_grant_credential").on(t.credentialId)],
);

/** Every authenticated lookup: who asked, which institution's records, what they were allowed.
 * The reference is kept only as a hash and no field value is ever written here. */
export const recordAccess = sqliteTable(
  "record_access",
  {
    id: text("id").primaryKey(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    credentialId: text("credential_id"),
    callerOrganizationId: text("caller_organization_id"),
    issuerOrganizationId: text("issuer_organization_id"),
    outcome: text("outcome").notNull(), // found | none | limited | refused
    audience: text("audience"),
    referenceHash: text("reference_hash"),
    fieldsReturned: integer("fields_returned").notNull().default(0),
  },
  (t) => [index("record_access_issuer").on(t.issuerOrganizationId, t.at), index("record_access_credential").on(t.credentialId, t.at)],
);

/** What an institution has chosen it may publish, per kind of record. There is NO default: a kind of record that has no
 * enabled policy cannot be published at all (we do not decide, for any country, what may be published).
 * `allowed` is the ceiling: field -> the audiences it may ever be shown to. A published field must be listed here and
 * may be offered only to audiences listed for it. Set by an institution owner on the web, never by an app. */
export const recordPolicy = sqliteTable(
  "record_policy",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    jurisdiction: text("jurisdiction").notNull(),
    recordType: text("record_type").notNull(),
    referenceKind: text("reference_kind").notNull(),
    /** JSON object: field -> audiences[] */
    allowed: text("allowed").notNull().default("{}"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** The institution's own words on why, or the instrument it relies on. Not checked by us. */
    basis: text("basis"),
    updatedBy: text("updated_by").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("record_policy_key").on(t.organizationId, t.jurisdiction, t.recordType, t.referenceKind)],
);

/** A named person at an institution, authorised by an institution owner to do some of the sensitive things in the records
 * API. A licensed computer proves WHICH COMPUTER is calling; it grants nothing. Each sensitive call must also carry the
 * officer's own secret, which is random, shown once, kept only as a hash, tied to the institution (and optionally to one
 * computer), expires, and can be revoked. The permissions are separate: publishing records, approving access (grants),
 * revoking access, administering application credentials, reading the access audit. */
export const recordOfficer = sqliteTable(
  "record_officer",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** The person, as the institution knows them. Written into the audit of everything they do. */
    name: text("name").notNull(),
    /** Their role at the institution, as a label for people to read. Decides nothing; `permissions` does. */
    title: text("title"),
    /** JSON array of: publish | approve | revoke | credentials | audit */
    permissions: text("permissions").notNull().default("[]"),
    /** When set, the secret works only from this licensed computer. */
    computerId: text("computer_id").references(() => computer.id, { onDelete: "cascade" }),
    secretHash: text("secret_hash").notNull().unique(),
    hint: text("hint").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("record_officer_org").on(t.organizationId)],
);

/** Everything an institution's officers and owners do to its publication rules, credentials and grants. No record values. */
export const recordAdminEvent = sqliteTable(
  "record_admin_event",
  {
    id: text("id").primaryKey(),
    at: integer("at", { mode: "timestamp_ms" }).notNull(),
    organizationId: text("organization_id").notNull(),
    /** officer:<id> for an officer, user:<id> for an owner on the web. */
    actor: text("actor").notNull(),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    subject: text("subject"),
    detail: text("detail"),
  },
  (t) => [index("record_admin_event_org").on(t.organizationId, t.at)],
);
