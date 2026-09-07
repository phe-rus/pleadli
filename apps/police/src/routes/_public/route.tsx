import { Headers } from '@/components/toolbar'
import { stationNav } from '@/data/nav'
import { PoliceBadgeIcon } from '@hugeicons/core-free-icons'
import { Dashboard } from '@pleadli/ui/sidebar'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <Dashboard
      brand={{
        to: '/',
        label: 'Pleadli Police',
        icon: PoliceBadgeIcon
      }}
      nav={stationNav}
    >
      <div className="relative flex min-h-dvh flex-col">
        <Headers />
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </Dashboard>
  )
}
