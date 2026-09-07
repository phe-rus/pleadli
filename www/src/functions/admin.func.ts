import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { AdminMiddleware } from '@/middlewares/admin'
import * as z from 'zod'

export const getAdminOverview = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const headers = getRequest().headers
    const [usersRes, organizations, templates] = await Promise.all([
      auth.api.listUsers({ headers, query: {} }),
      auth.api.listOrganizations({ headers }),
      auth.api.listTemplates({ headers }),
    ])

    const typeBreakdown = organizations.reduce<Record<string, number>>((acc, row) => {
      const t = (row as { institutionType?: string }).institutionType ?? 'undefined'
      acc[t] = (acc[t] ?? 0) + 1
      return acc
    }, {})

    return {
      users: usersRes.users,
      totalUsers: usersRes.total,
      organizations,
      totalOrganizations: organizations.length,
      templateCount: templates.length,
      orgsByType: typeBreakdown,
    }
  })

export const listOrganizationsAdmin = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const headers = getRequest().headers
    return auth.api.listOrganizations({ headers })
  })

export const listUsersAdmin = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const headers = getRequest().headers
    const result = await auth.api.listUsers({ headers, query: {} })
    return result.users
  })

export const stopImpersonating = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const headers = getRequest().headers
    return auth.api.stopImpersonating({ headers })
  })

const setUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'user']),
})

export const setUserRole = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(setUserRoleSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.setRole({ headers, body: data })
  })

const banUserSchema = z.object({
  userId: z.string().min(1),
  banReason: z.string().optional(),
  banExpiresIn: z.number().optional(),
})

export const banUser = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(banUserSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.banUser({ headers, body: data })
  })

const unbanUserSchema = z.object({ userId: z.string().min(1) })

export const unbanUser = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(unbanUserSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.unbanUser({ headers, body: data })
  })

const impersonateUserSchema = z.object({ userId: z.string().min(1) })

export const impersonateUser = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(impersonateUserSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.impersonateUser({ headers, body: data })
  })

const revokeUserSessionsSchema = z.object({ userId: z.string().min(1) })

export const revokeUserSessions = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(revokeUserSessionsSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.revokeUserSessions({ headers, body: data })
  })

const removeUserSchema = z.object({ userId: z.string().min(1) })

export const removeUser = createServerFn({ method: 'POST' })
  .middleware([AdminMiddleware])
  .validator(removeUserSchema)
  .handler(async ({ data }) => {
    const headers = getRequest().headers
    return auth.api.removeUser({ headers, body: data })
  })