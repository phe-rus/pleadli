import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { AdminMiddleware } from '@/middlewares/admin'

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