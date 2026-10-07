import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from 'better-auth/api'
import * as z from 'zod'
import type { BetterAuthPlugin } from 'better-auth'
import { requireAdmin } from './middleware'
import type { Entitlement, Membership, Organization, OrganizationUnit } from '../types'

export const institutions = () => {
  return {
    id: 'institution',
    schema: {
      organization: {
        fields: {
          name: { type: 'string', required: true },
          slug: { type: 'string', required: true, unique: true },
          logo: { type: 'string', required: false },
          institutionType: { type: 'string', required: true },
          // Pleadli Orchestra (docs/platform/ORCHESTRA-PLAN.md): a public
          // institution registers at its headquarters, an advocate or firm as a
          // practice; a registration waits for staff review, and only then is
          // its address issued. The address never changes afterwards.
          kind: { type: 'string', required: true, defaultValue: 'institution' },
          country: { type: 'string', required: true, defaultValue: 'UG' },
          district: { type: 'string', required: false },
          contactEmail: { type: 'string', required: false },
          contactPhone: { type: 'string', required: false },
          status: { type: 'string', required: true, defaultValue: 'active' },
          address: { type: 'string', required: false, unique: true },
          requestedAt: { type: 'date', required: false },
          reviewedAt: { type: 'date', required: false },
          reviewedBy: { type: 'string', required: false },
          reviewNote: { type: 'string', required: false },
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
          // An office under the institution (a station, a facility, a court),
          // with its own address under the institution's.
          kind: { type: 'string', required: true, defaultValue: 'office' },
          district: { type: 'string', required: false },
          address: { type: 'string', required: false, unique: true },
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
        },
      },
    },
    endpoints: {
      createOrganization: createAuthEndpoint(
        '/institution/organizations/create',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({
            name: z.string().min(1),
            slug: z.string().min(1),
            institutionType: z.string().min(1),
          }),
        },
        async (ctx) => {
          const existing = await ctx.context.adapter.findOne<Organization>({
            model: 'organization',
            where: [{ field: 'slug', value: ctx.body.slug }],
          })
          if (existing) throw new APIError('BAD_REQUEST', { message: 'Slug already in use' })

          const organization = await ctx.context.adapter.create<Organization>({
            model: 'organization',
            data: {
              name: ctx.body.name,
              slug: ctx.body.slug,
              institutionType: ctx.body.institutionType,
            },
          })

          const template = await ctx.context.adapter.findOne<any>({
            model: 'institutionTemplate',
            where: [{ field: 'institutionType', value: ctx.body.institutionType }],
          })

          if (template) {
            await seedFromTemplate(ctx, organization.id, template)
          }

          return ctx.json(organization)
        },
      ),
      listOrganizations: createAuthEndpoint(
        '/institution/organizations/list',
        { method: 'GET', use: [sessionMiddleware, requireAdmin] },
        async (ctx) => {
          const rows = await ctx.context.adapter.findMany<Organization>({ model: 'organization' })
          return ctx.json(rows)
        },
      ),
      getOrganization: createAuthEndpoint(
        '/institution/organizations/get',
        {
          method: 'GET',
          use: [sessionMiddleware, requireAdmin],
          query: z.object({ id: z.string().min(1) }),
        },
        async (ctx) => {
          const organization = await ctx.context.adapter.findOne<Organization>({
            model: 'organization',
            where: [{ field: 'id', value: ctx.query.id }],
          })
          if (!organization) throw new APIError('NOT_FOUND', { message: 'Organization not found' })

          const [units, entitlements] = await Promise.all([
            ctx.context.adapter.findMany<OrganizationUnit>({
              model: 'organizationUnit',
              where: [{ field: 'organizationId', value: organization.id }],
            }),
            ctx.context.adapter.findMany<Entitlement>({
              model: 'entitlement',
              where: [{ field: 'organizationId', value: organization.id }],
            }),
          ])

          const unitIds = units.map((unit) => unit.id)
          const memberships =
            unitIds.length > 0
              ? await ctx.context.adapter.findMany<Membership>({
                  model: 'membership',
                  where: [{ field: 'organizationUnitId', value: unitIds, operator: 'in' }],
                })
              : []

          return ctx.json({ organization, units, entitlements, memberships })
        },
      ),
      updateOrganization: createAuthEndpoint(
        '/institution/organizations/update',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({
            id: z.string().min(1),
            name: z.string().min(1).optional(),
            slug: z.string().min(1).optional(),
            institutionType: z.string().min(1).optional(),
          }),
        },
        async (ctx) => {
          const { id, ...patch } = ctx.body
          const updated = await ctx.context.adapter.update<Organization>({
            model: 'organization',
            where: [{ field: 'id', value: id }],
            update: patch,
          })
          if (!updated) throw new APIError('NOT_FOUND', { message: 'Organization not found' })
          return ctx.json(updated)
        },
      ),
      deleteOrganization: createAuthEndpoint(
        '/institution/organizations/delete',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({ id: z.string().min(1) }),
        },
        async (ctx) => {
          await ctx.context.adapter.delete({
            model: 'organization',
            where: [{ field: 'id', value: ctx.body.id }],
          })
          return ctx.json({ ok: true })
        },
      ),
      deleteOrganizations: createAuthEndpoint(
        '/institution/organizations/delete-many',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({ ids: z.array(z.string()).min(1) }),
        },
        async (ctx) => {
          for (const id of ctx.body.ids) {
            await ctx.context.adapter.delete({
              model: 'organization',
              where: [{ field: 'id', value: id }],
            })
          }
          return ctx.json({ deleted: ctx.body.ids.length })
        },
      ),
      listUnits: createAuthEndpoint(
        '/institution/units/list',
        {
          method: 'GET',
          use: [sessionMiddleware, requireAdmin],
          query: z.object({ organizationId: z.string().min(1) }),
        },
        async (ctx) => {
          const rows = await ctx.context.adapter.findMany<OrganizationUnit>({
            model: 'organizationUnit',
            where: [{ field: 'organizationId', value: ctx.query.organizationId }],
          })
          return ctx.json(rows)
        },
      ),
      createUnit: createAuthEndpoint(
        '/institution/units/create',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({
            organizationId: z.string().min(1),
            name: z.string().min(1),
            parentId: z.string().optional(),
          }),
        },
        async (ctx) => {
          const unit = await ctx.context.adapter.create<Record<string, any>>({
            model: 'organizationUnit',
            forceAllowId: true,
            data: {
              id: crypto.randomUUID(),
              organizationId: ctx.body.organizationId,
              name: ctx.body.name,
              parentId: ctx.body.parentId ?? null,
            },
          })
          return ctx.json(unit)
        },
      ),
      deleteUnit: createAuthEndpoint(
        '/institution/units/delete',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({ id: z.string().min(1) }),
        },
        async (ctx) => {
          await ctx.context.adapter.delete({
            model: 'organizationUnit',
            where: [{ field: 'id', value: ctx.body.id }],
          })
          return ctx.json({ ok: true })
        },
      ),
      listMemberships: createAuthEndpoint(
        '/institution/memberships/list',
        {
          method: 'GET',
          use: [sessionMiddleware, requireAdmin],
          query: z.object({ organizationUnitId: z.string().min(1) }),
        },
        async (ctx) => {
          const rows = await ctx.context.adapter.findMany<OrganizationUnit>({
            model: 'membership',
            where: [{ field: 'organizationUnitId', value: ctx.query.organizationUnitId }],
          })
          return ctx.json(rows)
        },
      ),
      createMembership: createAuthEndpoint(
        '/institution/memberships/create',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({
            userId: z.string().min(1),
            organizationUnitId: z.string().min(1),
            title: z.string().min(1),
          }),
        },
        async (ctx) => {
          const membership = await ctx.context.adapter.create<Record<string, any>>({
            model: 'membership',
            forceAllowId: true,
            data: {
              id: crypto.randomUUID(),
              userId: ctx.body.userId,
              organizationUnitId: ctx.body.organizationUnitId,
              title: ctx.body.title,
            },
          })
          return ctx.json(membership)
        },
      ),
      deleteMembership: createAuthEndpoint(
        '/institution/memberships/delete',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({ id: z.string().min(1) }),
        },
        async (ctx) => {
          await ctx.context.adapter.delete({
            model: 'membership',
            where: [{ field: 'id', value: ctx.body.id }],
          })
          return ctx.json({ ok: true })
        },
      ),
      listEntitlements: createAuthEndpoint(
        '/institution/entitlements/list',
        {
          method: 'GET',
          use: [sessionMiddleware, requireAdmin],
          query: z.object({ organizationId: z.string().min(1) }),
        },
        async (ctx) => {
          const rows = await ctx.context.adapter.findMany<OrganizationUnit>({
            model: 'entitlement',
            where: [{ field: 'organizationId', value: ctx.query.organizationId }],
          })
          return ctx.json(rows)
        },
      ),
      setEntitlement: createAuthEndpoint(
        '/institution/entitlements/set',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({
            organizationId: z.string().min(1),
            application: z.string().min(1),
            enabled: z.boolean(),
          }),
        },
        async (ctx) => {
          const existing = await ctx.context.adapter.findOne<Entitlement>({
            model: 'entitlement',
            where: [
              { field: 'organizationId', value: ctx.body.organizationId },
              { field: 'application', value: ctx.body.application },
            ],
          })

          if (existing) {
            const updated = await ctx.context.adapter.update<Entitlement>({
              model: 'entitlement',
              where: [{ field: 'id', value: existing.id }],
              update: { enabled: ctx.body.enabled },
            })
            return ctx.json(updated)
          }

          const created = await ctx.context.adapter.create<Record<string, any>>({
            model: 'entitlement',
            forceAllowId: true,
            data: {
              id: crypto.randomUUID(),
              organizationId: ctx.body.organizationId,
              application: ctx.body.application,
              enabled: ctx.body.enabled,
            },
          })
          return ctx.json(created)
        },
      ),
      deleteEntitlement: createAuthEndpoint(
        '/institution/entitlements/delete',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({ id: z.string().min(1) }),
        },
        async (ctx) => {
          await ctx.context.adapter.delete({
            model: 'entitlement',
            where: [{ field: 'id', value: ctx.body.id }],
          })
          return ctx.json({ ok: true })
        },
      ),
    },
  } satisfies BetterAuthPlugin
}

type Adapter = {
  create<T>(data: {
    model: string
    forceAllowId?: boolean
    data: Omit<T, 'id'> & { id?: string }
  }): Promise<T>
}

interface AdapterCtx {
  context: { adapter: Adapter }
}

async function seedFromTemplate(
  ctx: AdapterCtx,
  organizationId: string,
  template: any,
) {
  if (template.defaultEntitlements?.length > 0) {
    for (const entitlement of template.defaultEntitlements) {
      if (entitlement.enabled === false) continue
      await ctx.context.adapter.create<any>({
        model: 'entitlement',
        forceAllowId: true,
        data: {
          id: crypto.randomUUID(),
          organizationId,
          application: entitlement.application,
          enabled: entitlement.enabled,
        },
      })
    }
  }
  if (template.defaultUnits?.length > 0) {
    await insertUnitTree(ctx, organizationId, template.defaultUnits, undefined)
  }
}

async function insertUnitTree(
  ctx: AdapterCtx,
  organizationId: string,
  units: any[],
  parentId: string | undefined,
) {
  for (const unit of units) {
    const row = await ctx.context.adapter.create<Record<string, any>>({
      model: 'organizationUnit',
      forceAllowId: true,
      data: {
        id: crypto.randomUUID(),
        organizationId,
        name: unit.name,
        parentId: parentId ?? null,
      },
    })
    if (unit.children?.length > 0) {
      await insertUnitTree(ctx, organizationId, unit.children, row.id)
    }
  }
}