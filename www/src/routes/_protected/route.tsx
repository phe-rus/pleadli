import { protectedOption } from '@/functions/session.func'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.query.query(protectedOption)
    if (!session) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href
        },
      })
    }
    return { session }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet />
}
