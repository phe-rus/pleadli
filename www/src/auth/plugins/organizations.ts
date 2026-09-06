import { createAuthEndpoint, createAuthMiddleware, sessionMiddleware, APIError } from 'better-auth/api'
import * as z from 'zod'
import type { BetterAuthPlugin } from '@better-auth/core'
import { db } from '../../db'
import { organization, organizationUnit, membership } from '../../db/auth-schema'
import { eq } from 'drizzle-orm'

// Pleadli's own organization model, as a real Better Auth plugin rather than
// the stock `organization` plugin. The stock plugin is flat (one org, a flat
// member list, optional flat teams) with no parent-child hierarchy — fine for
// the top-level institution list (Police, DPP, Courts, ...), but institutions
// themselves need real depth (HQ -> Region -> Division -> Station), which the
// stock plugin has no primitive for. This plugin owns that whole shape itself.
//
// Authorization: every endpoint below requires platform_admin (see the `role`
// additionalField on `user` in ../index.ts). This is coarse on purpose — a
// single platform-wide capability, not per-institution authority — because
// institution-scoped admin (a Police tenant-admin managing only Police's own
// units) doesn't have a second real consumer to design against yet. Narrowing
// this to real capabilities/institution-scoped roles is the next increment.
const requirePlatformAdmin = createAuthMiddleware(async (ctx) => {
  const role = (ctx.context.session?.user as { role?: string } | undefined)?.role
  if (role !== 'platform_admin') {
    throw new APIError('FORBIDDEN', { message: 'Requires platform_admin' })
  }
})

export const pleadliOrganizations = () => {
  return {
    id: 'pleadli-organizations',
    schema: {
      organization: {
        fields: {
          name: { type: 'string', required: true },
          slug: { type: 'string', required: true, unique: true },
          institutionType: { type: 'string', required: true },
          createdAt: { type: 'date', required: true, defaultValue: () => new Date() },
        },
      },
      organizationUnit: {
        fields: {
          organizationId: {
            type: 'string',
            required: true,
            references: { model: 'organization', field: 'id', onDelete: 'cascade' },
          },
          parentId: { type: 'string', required: false },
          name: { type: 'string', required: true },
          createdAt: { type: 'date', required: true, defaultValue: () => new Date() },
        },
      },
      membership: {
        fields: {
          userId: {
            type: 'string',
            required: true,
            references: { model: 'user', field: 'id', onDelete: 'cascade' },
          },
          organizationUnitId: {
            type: 'string',
            required: true,
            references: { model: 'organizationUnit', field: 'id', onDelete: 'cascade' },
          },
          title: { type: 'string', required: true },
          createdAt: { type: 'date', required: true, defaultValue: () => new Date() },
        },
      },
      entitlement: {
        fields: {
          organizationId: {
            type: 'string',
            required: true,
            references: { model: 'organization', field: 'id', onDelete: 'cascade' },
          },
          application: { type: 'string', required: true },
          enabled: { type: 'boolean', required: true, defaultValue: true },
          createdAt: { type: 'date', required: true, defaultValue: () => new Date() },
        },
      },
    },
    endpoints: {
      createOrganization: createAuthEndpoint(
        '/pleadli/organizations',
        {
          method: 'POST',
          use: [sessionMiddleware, requirePlatformAdmin],
          body: z.object({
            name: z.string().min(1),
            slug: z.string().min(1),
            institutionType: z.enum(['police', 'dpp', 'courts', 'prisons', 'lawyers']),
          }),
        },
        async (ctx) => {
          const existing = await db
            .select({ id: organization.id })
            .from(organization)
            .where(eq(organization.slug, ctx.body.slug))
          if (existing.length > 0) {
            throw new APIError('BAD_REQUEST', { message: 'Slug already in use' })
          }
          const [org] = await db
            .insert(organization)
            .values({ id: crypto.randomUUID(), ...ctx.body })
            .returning()
          return ctx.json(org)
        },
      ),
      listOrganizations: createAuthEndpoint(
        '/pleadli/organizations',
        { method: 'GET', use: [sessionMiddleware, requirePlatformAdmin] },
        async (ctx) => {
          const rows = await db.select().from(organization)
          return ctx.json(rows)
        },
      ),
      createOrganizationUnit: createAuthEndpoint(
        '/pleadli/organization-units',
        {
          method: 'POST',
          use: [sessionMiddleware, requirePlatformAdmin],
          body: z.object({
            organizationId: z.string().min(1),
            parentId: z.string().min(1).optional(),
            name: z.string().min(1),
          }),
        },
        async (ctx) => {
          const [unit] = await db
            .insert(organizationUnit)
            .values({ id: crypto.randomUUID(), ...ctx.body })
            .returning()
          return ctx.json(unit)
        },
      ),
      createMembership: createAuthEndpoint(
        '/pleadli/memberships',
        {
          method: 'POST',
          use: [sessionMiddleware, requirePlatformAdmin],
          body: z.object({
            userId: z.string().min(1),
            organizationUnitId: z.string().min(1),
            title: z.string().min(1),
          }),
        },
        async (ctx) => {
          const [row] = await db
            .insert(membership)
            .values({ id: crypto.randomUUID(), ...ctx.body })
            .returning()
          return ctx.json(row)
        },
      ),
    },
  } satisfies BetterAuthPlugin
}
