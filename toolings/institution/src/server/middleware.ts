import { createAuthMiddleware, APIError } from 'better-auth/api'

export const requireAdmin = createAuthMiddleware(async (ctx) => {
  const role = (ctx.context.session?.user as { role?: string } | undefined)?.role
  if (role !== 'admin') {
    throw new APIError('FORBIDDEN', { message: 'Requires admin' })
  }
})