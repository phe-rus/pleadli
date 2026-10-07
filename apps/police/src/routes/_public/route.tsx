import { SidebarProvider } from '@/components/sidebar-provider'
import { useInstallation } from '@/features/session'
import { useCustodyDeadlineAlerts } from '@/hooks/use-custody-deadline-alerts'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  component: RouteComponent,
})

/** Custody deadline alerts, for a station only: a command holds no custody
 * records and refuses to be asked for them. */
function CustodyDeadlineAlerts() {
  useCustodyDeadlineAlerts()
  return null
}

function RouteComponent() {
  const { data: installation } = useInstallation()

  return (
    <SidebarProvider>
      {installation?.mode === 'station' && <CustodyDeadlineAlerts />}
      <Outlet />
    </SidebarProvider>
  )
}
