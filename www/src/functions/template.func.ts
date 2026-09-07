import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { AdminMiddleware } from '@/middlewares/admin'
import * as z from 'zod'

export const listTemplates = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const headers = getRequest().headers
    return auth.api.listTemplates({ headers })
  })

const defaultUnitsSchema: z.ZodType<{ name: string; children?: unknown[] }> = z.lazy(() =>
  z.object({
    name: z.string(),
    children: z.array(defaultUnitsSchema).optional(),
  }),
)

const updateTemplateSchema = z.object({
  institutionType: z.enum(['police', 'dpp', 'courts', 'prisons', 'lawyers']),
  name: z.string().min(1),
  description: z.string().optional(),
  defaultUnits: z.array(defaultUnitsSchema),
  defaultEntitlements: z.array(
    z.object({ application: z.string().min(1), enabled: z.boolean() }),
  ),
  formSchema: z.array(
    z.object({
      name: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(['text', 'textarea', 'select', 'date']),
      required: z.boolean().optional(),
      options: z.array(z.string()).optional(),
    }),
  ),
})

export const updateTemplate = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(updateTemplateSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.upsertTemplate({ headers, body: data })
  })

const deleteTemplateSchema = z.object({ institutionType: z.enum(['police', 'dpp', 'courts', 'prisons', 'lawyers']) })

export const deleteTemplate = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(deleteTemplateSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.deleteTemplate({ headers, body: { institutionType: data.institutionType } })
  })