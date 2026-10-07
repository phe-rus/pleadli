import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

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
  // Pleadli Orchestra (docs/platform/ORCHESTRA-PLAN.md). A public institution
  // registers at its headquarters; an advocate or firm registers as a practice.
  kind: text("kind").default("institution").notNull(),
  country: text("country").default("UG").notNull(),
  district: text("district"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // Registration is a request until Pleadli staff approve it; only then is
  // the address issued, and it never changes afterwards.
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
  // An office under the institution (a station, a facility, a court), with
  // its own Orchestra address under the institution's: ug.police.albertine.kagadi.
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

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(membership),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  organizationUnits: many(organizationUnit),
  entitlements: many(entitlement),
}));

export const organizationUnitRelations = relations(
  organizationUnit,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [organizationUnit.organizationId],
      references: [organization.id],
    }),
    memberships: many(membership),
  }),
);

export const membershipRelations = relations(membership, ({ one }) => ({
  user: one(user, {
    fields: [membership.userId],
    references: [user.id],
  }),
  organizationUnit: one(organizationUnit, {
    fields: [membership.organizationUnitId],
    references: [organizationUnit.id],
  }),
}));

export const entitlementRelations = relations(entitlement, ({ one }) => ({
  organization: one(organization, {
    fields: [entitlement.organizationId],
    references: [organization.id],
  }),
}));
