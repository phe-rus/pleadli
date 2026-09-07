import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { AdminMiddleware } from '@/middlewares/admin'

export const getAdminOverview = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const headers = getRequest().headers
    const [organizations, users] = await Promise.all([
      auth.api.listOrganizations({ headers }),
      auth.api.listUsers({ headers, query: {} }),
    ])
    return { organizations, users: users.users, totalUsers: users.total }
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
