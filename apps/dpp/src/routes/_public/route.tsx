import { SidebarProvider } from '@/components/sidebar-provider'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider>
      <Outlet />
    </SidebarProvider>
  )
}
