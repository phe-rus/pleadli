import { SidebarProvider } from '@/components/sidebar-provider'
import { permissionsForPath } from '@/data/navigationItems'
import { sessionOptions } from '@/features/session'
import { getSessionToken } from '@/lib/api'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  // Stops a page the signed-in role may not read (reached by URL, or left open
  // when the role changed) from running loaders the node will refuse. The node
  // still enforces every call; this only avoids showing its refusal as a crash.
  beforeLoad: async ({ context, location }) => {
    const required = permissionsForPath(location.pathname)
    const token = getSessionToken()
    if (!required || !token) return
    const session = await context.queryClient.query({ ...sessionOptions(token) }).catch(() => null)
    if (session && !required.some((p) => session.permissions.includes(p))) throw redirect({ to: '/' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider>
      <Outlet />
    </SidebarProvider>
  )
}
