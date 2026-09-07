import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { AdminMiddleware } from '@/middlewares/admin'
import { INSTITUTION_TYPES } from '@pleadli/templates'
import * as z from 'zod'

export const institutionTypes = INSTITUTION_TYPES

const createOrganizationSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  institutionType: z.enum([...INSTITUTION_TYPES] as [string, ...string[]]),
})

export const createOrganization = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(createOrganizationSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.createOrganization({ headers, body: data })
  })

const orgDetailSchema = z.object({
  id: z.string().min(1),
})

export const getOrganizationDetail = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .validator(orgDetailSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.getOrganization({ headers, query: { id: data.id } })
  })

const deleteOrganizationsSchema = z.object({
  ids: z.array(z.string()).min(1),
})

export const deleteOrganizations = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(deleteOrganizationsSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.deleteOrganizations({ headers, body: { ids: data.ids } })
  })

const updateOrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  institutionType: z.enum([...INSTITUTION_TYPES] as [string, ...string[]]).optional(),
})

export const updateOrganization = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(updateOrganizationSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.updateOrganization({ headers, body: data })
  })

const createUnitSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().optional(),
})

export const createUnit = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(createUnitSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.createUnit({ headers, body: data })
  })

const deleteUnitSchema = z.object({
  id: z.string().min(1),
})

export const deleteUnit = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(deleteUnitSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.deleteUnit({ headers, body: { id: data.id } })
  })

const setEntitlementSchema = z.object({
  organizationId: z.string().min(1),
  application: z.string().min(1),
  enabled: z.boolean(),
})

export const setEntitlement = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(setEntitlementSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.setEntitlement({ headers, body: data })
  })

const createMembershipSchema = z.object({
  userId: z.string().min(1),
  organizationUnitId: z.string().min(1),
  title: z.string().min(1),
})

export const createMembership = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(createMembershipSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.createMembership({ headers, body: data })
  })

const deleteMembershipSchema = z.object({ id: z.string().min(1) })

export const deleteMembership = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(deleteMembershipSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.deleteMembership({ headers, body: { id: data.id } })
  })