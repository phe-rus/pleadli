import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from 'better-auth/api'
import * as z from 'zod'
import type { BetterAuthPlugin } from 'better-auth'
import { INSTITUTION_TYPES, type InstitutionTemplate } from '../types'
import { requireAdmin } from './middleware'

const institutionTypeSchema = z.enum([...INSTITUTION_TYPES] as [string, ...string[]])

const templateUnitSchema: z.ZodType<{ name: string; children?: unknown[] }> = z.lazy(() =>
  z.object({
    name: z.string(),
    children: z.array(templateUnitSchema).optional(),
  }),
)

const templateEntitlementSchema = z.object({
  application: z.string().min(1),
  enabled: z.boolean(),
})

const templateFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select', 'date']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
})

export const templates = () => {
  return {
    id: 'templates',
    schema: {
      institutionTemplate: {
        fields: {
          institutionType: { type: 'string', required: true, unique: true },
          name: { type: 'string', required: true },
          description: { type: 'string', required: false },
          defaultUnits: { type: 'json', required: true },
          defaultEntitlements: { type: 'json', required: true },
          formSchema: { type: 'json', required: true },
        },
      },
    },
    endpoints: {
      listTemplates: createAuthEndpoint(
        '/templates/list',
        { method: 'GET', use: [sessionMiddleware, requireAdmin] },
        async (ctx) => {
          const rows = await ctx.context.adapter.findMany<InstitutionTemplate>({
            model: 'institutionTemplate',
          })
          return ctx.json(rows)
        },
      ),
      getTemplate: createAuthEndpoint(
        '/templates/get',
        {
          method: 'GET',
          use: [sessionMiddleware, requireAdmin],
          query: z.object({ institutionType: institutionTypeSchema }),
        },
        async (ctx) => {
          const row = await ctx.context.adapter.findOne<InstitutionTemplate>({
            model: 'institutionTemplate',
            where: [{ field: 'institutionType', value: ctx.query.institutionType }],
          })
          if (!row) throw new APIError('NOT_FOUND', { message: 'Template not found' })
          return ctx.json(row)
        },
      ),
      upsertTemplate: createAuthEndpoint(
        '/templates/upsert',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({
            institutionType: institutionTypeSchema,
            name: z.string().min(1),
            description: z.string().optional(),
            defaultUnits: z.array(templateUnitSchema),
            defaultEntitlements: z.array(templateEntitlementSchema),
            formSchema: z.array(templateFieldSchema),
          }),
        },
        async (ctx) => {
          const existing = await ctx.context.adapter.findOne<InstitutionTemplate>({
            model: 'institutionTemplate',
            where: [{ field: 'institutionType', value: ctx.body.institutionType }],
          })

          if (existing) {
            const updated = await ctx.context.adapter.update<InstitutionTemplate>({
              model: 'institutionTemplate',
              where: [{ field: 'institutionType', value: ctx.body.institutionType }],
              update: {
                name: ctx.body.name,
                description: ctx.body.description ?? null,
                defaultUnits: ctx.body.defaultUnits,
                defaultEntitlements: ctx.body.defaultEntitlements,
                formSchema: ctx.body.formSchema,
              },
            })
            return ctx.json(updated)
          }

          const created = await ctx.context.adapter.create<Record<string, any>>({
            model: 'institutionTemplate',
            forceAllowId: true,
            data: {
              id: crypto.randomUUID(),
              institutionType: ctx.body.institutionType,
              name: ctx.body.name,
              description: ctx.body.description ?? null,
              defaultUnits: ctx.body.defaultUnits,
              defaultEntitlements: ctx.body.defaultEntitlements,
              formSchema: ctx.body.formSchema,
            },
          })
          return ctx.json(created)
        },
      ),
      deleteTemplate: createAuthEndpoint(
        '/templates/delete',
        {
          method: 'POST',
          use: [sessionMiddleware, requireAdmin],
          body: z.object({ institutionType: institutionTypeSchema }),
        },
        async (ctx) => {
          await ctx.context.adapter.delete({
            model: 'institutionTemplate',
            where: [{ field: 'institutionType', value: ctx.body.institutionType }],
          })
          return ctx.json({ ok: true })
        },
      ),
    },
  } satisfies BetterAuthPlugin
}