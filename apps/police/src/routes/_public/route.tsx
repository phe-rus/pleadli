import { SidebarProvider } from '@/components/sidebar-provider'
import { useCustodyDeadlineAlerts } from '@/hooks/use-custody-deadline-alerts'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  component: RouteComponent,
})

function RouteComponent() {
  useCustodyDeadlineAlerts()

  return (
    <SidebarProvider>
      <Outlet />
    </SidebarProvider>
  )
}
