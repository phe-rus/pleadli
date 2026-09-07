import { Dashboard } from '@pleadli/ui/sidebar'
import { stationNav } from '@/data/nav'
import { PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <Dashboard brand={{ to: '/', label: 'Pleadli Police', icon: PoliceBadgeIcon }} nav={stationNav}>
      <div className="p-6">
        <Outlet />
      </div>
    </Dashboard>
  )
}
