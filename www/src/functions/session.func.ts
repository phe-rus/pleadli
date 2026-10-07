import { createServerFn } from '@tanstack/react-start'
import { queryOptions } from '@tanstack/react-query'
import { SessionMiddleware } from '@/middlewares/session'

export const getCurrentSession = createServerFn({ method: 'GET' })
  .middleware([SessionMiddleware])
  .handler(async ({ context }) => context.session)

/** Any signed-in person: institutions on /orchestra and staff on /admin.
 * /admin checks the staff role itself, and every staff server function runs
 * behind AdminMiddleware. */
const protectedSession = createServerFn({ method: 'GET' })
  .middleware([SessionMiddleware])
  .handler(async ({ context }) => context.session)

export const meOptions = () =>
  queryOptions({
    queryKey: ['me'],
    queryFn: () => getCurrentSession(),
    staleTime: 'static',
  })

export const protectedOption = queryOptions({
  queryKey: ['protected'],
  queryFn: protectedSession,
  staleTime: 'static',
})

