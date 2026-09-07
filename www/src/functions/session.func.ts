import { createServerFn } from '@tanstack/react-start'
import { queryOptions } from '@tanstack/react-query'
import { SessionMiddleware } from '@/middlewares/session'

export const getCurrentSession = createServerFn({ method: 'GET' })
  .middleware([SessionMiddleware])
  .handler(async ({ context }) => context.session)

export const meOptions = () =>
  queryOptions({
    queryKey: ['me'],
    queryFn: () => getCurrentSession(),
    staleTime: 'static',
  })
