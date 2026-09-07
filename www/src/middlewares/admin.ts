import { createMiddleware } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { auth } from '@/auth'

export const AdminMiddleware = createMiddleware().server(async ({ next, request }) => {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    throw redirect({ to: '/login', replace: true })
  }
  if (session.user.role !== 'admin') {
    throw redirect({ to: '/', replace: true })
  }
  return next({ context: { session } })
})
