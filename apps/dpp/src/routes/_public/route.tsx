import { SidebarProvider } from '@/components/sidebar-provider'
import { useInstalledZone } from '@/features/timezone'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  component: RouteComponent,
})

function RouteComponent() {
  const zone = useInstalledZone(true)
  return (
    <SidebarProvider>
      <Outlet key={zone} />
    </SidebarProvider>
  )
}
