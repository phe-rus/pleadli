import { getCurrentSession } from '@/functions/session.func'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected')({
  beforeLoad: async ({ location }) => {
    const session = await getCurrentSession()
    if (!session) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
    return { session }
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <Outlet />
}
