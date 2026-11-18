import { defineRelationsPart, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const institutionTemplate = sqliteTable("institution_template", {
  id: text("id").primaryKey(),
  institutionType: text("institution_type").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  defaultUnits: text("default_units", { mode: "json" }).notNull(),
  defaultEntitlements: text("default_entitlements", { mode: "json" }).notNull(),
  formSchema: text("form_schema", { mode: "json" }).notNull(),
});

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  institutionType: text("institution_type").notNull(),
  kind: text("kind").default("institution").notNull(),
  country: text("country").default("UG").notNull(),
  district: text("district"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  status: text("status").default("active").notNull(),
  address: text("address").unique(),
  requestedAt: integer("requested_at", { mode: "timestamp_ms" }),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewedBy: text("reviewed_by"),
  reviewNote: text("review_note"),
});

export const organizationUnit = sqliteTable("organization_unit", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  kind: text("kind").default("office").notNull(),
  district: text("district"),
  address: text("address").unique(),
});

export const membership = sqliteTable("membership", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  organizationUnitId: text("organization_unit_id")
    .notNull()
    .references(() => organizationUnit.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
});

export const entitlement = sqliteTable("entitlement", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  application: text("application").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
});

export const authRelations = defineRelationsPart(
  {
    user,
    session,
    account,
    verification,
    institutionTemplate,
    organization,
    organizationUnit,
    membership,
    entitlement,
  },
  (r) => ({
    user: {
      sessions: r.many.session({
        from: r.user.id,
        to: r.session.userId,
      }),
      accounts: r.many.account({
        from: r.user.id,
        to: r.account.userId,
      }),
      memberships: r.many.membership({
        from: r.user.id,
        to: r.membership.userId,
      }),
    },
    session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
      }),
    },
    account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
      }),
    },
    organization: {
      organizationUnits: r.many.organizationUnit({
        from: r.organization.id,
        to: r.organizationUnit.organizationId,
      }),
      entitlements: r.many.entitlement({
        from: r.organization.id,
        to: r.entitlement.organizationId,
      }),
    },
    organizationUnit: {
      organization: r.one.organization({
        from: r.organizationUnit.organizationId,
        to: r.organization.id,
      }),
      memberships: r.many.membership({
        from: r.organizationUnit.id,
        to: r.membership.organizationUnitId,
      }),
    },
    membership: {
      user: r.one.user({
        from: r.membership.userId,
        to: r.user.id,
      }),
      organizationUnit: r.one.organizationUnit({
        from: r.membership.organizationUnitId,
        to: r.organizationUnit.id,
      }),
    },
    entitlement: {
      organization: r.one.organization({
        from: r.entitlement.organizationId,
        to: r.organization.id,
      }),
    },
  }),
);
