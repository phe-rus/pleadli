import { CloudShell } from '@/components/cloud-shell'
import { adminGroups } from '@/data/admin'
import { stopImpersonating } from '@/functions/admin.func'
import { JusticeScale01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/admin')({
  beforeLoad: ({ context }) => {
    if (context.session.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  component: RouteComponent,
})

/** Pleadli Admin: staff only. */
function RouteComponent() {
  const { session } = Route.useRouteContext()
  const [isStoppingImpersonation, setIsStoppingImpersonation] = useState(false)
  const impersonatedBy = session.session.impersonatedBy

  return (
    <CloudShell
      brand={{ to: '/admin', label: 'Pleadli Admin', icon: JusticeScale01Icon }}
      groups={adminGroups}
      signedInAs={session.user.email}
      links={[{ to: '/account', label: 'Pleadli Account' }, { to: '/', label: 'pleadli.com' }]}
      signOutLabel="Sign out"
      openMenuLabel="Open menu"
      closeMenuLabel="Close menu"
      banner={impersonatedBy && (
        <div className={cn(
          'sticky top-0 z-40 flex items-center justify-between',
          'gap-3 border-b bg-destructive/10 px-5 py-2 text-xs',
          'text-destructive',
        )}>
          <span>
            Impersonating <strong>{session.user.name}</strong> ({session.user.email})
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={isStoppingImpersonation}
            onClick={async () => {
              setIsStoppingImpersonation(true)
              await stopImpersonating()
              window.location.reload()
            }}
          >
            {isStoppingImpersonation ? 'Stopping…' : 'Stop impersonating'}
          </Button>
        </div>
      )}
    >
      <Outlet />
    </CloudShell>
  )
}
