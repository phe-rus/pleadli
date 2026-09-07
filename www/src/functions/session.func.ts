import { createServerFn } from '@tanstack/react-start'
import { queryOptions } from '@tanstack/react-query'
import { SessionMiddleware } from '@/middlewares/session'
import { AdminMiddleware } from '@/middlewares/admin'

export const getCurrentSession = createServerFn({ method: 'GET' })
  .middleware([SessionMiddleware])
  .handler(async ({ context }) => context.session)

const protectedSession = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
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

