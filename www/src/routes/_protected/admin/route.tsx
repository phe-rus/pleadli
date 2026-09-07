import { authClient } from '@/auth/client'
import { adminNav } from '@/data/admin'
import { JusticeScale01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@pleadli/ui/button'
import { Dashboard } from '@pleadli/ui/sidebar'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useCallback, useState } from 'react'

export const Route = createFileRoute('/_protected/admin')({
  beforeLoad: ({ context }) => {
    if (context.session.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { session } = Route.useRouteContext()
  const [isPending, setIsPending] = useState(false)
  const [isStoppingImpersonation, setIsStoppingImpersonation] = useState(false)
  const impersonatedBy = session.session.impersonatedBy

  const signOut = useCallback(() => {
    setIsPending(true)
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/'
        },
      },
    })
  }, [])

  return (
    <Dashboard
      brand={{ to: '/', label: 'Pleadli', icon: JusticeScale01Icon }}
      nav={adminNav}
      footer={
        <Button size="sm" className="w-fit!" variant="destructive" onClick={signOut} disabled={isPending}>
          {isPending ? 'Signing out...' : 'Sign out'}
        </Button>
      }
      banner={
        impersonatedBy && (
          <div className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-destructive/10 px-5 py-2 text-xs text-destructive">
            <span>
              Impersonating <strong>{session.user.name}</strong> ({session.user.email})
            </span>
            <Button
              size="xs"
              variant="outline"
              disabled={isStoppingImpersonation}
              onClick={async () => {
                setIsStoppingImpersonation(true)
                await authClient.admin.stopImpersonating()
                window.location.reload()
              }}
            >
              {isStoppingImpersonation ? 'Stopping…' : 'Stop impersonating'}
            </Button>
          </div>
        )
      }
    >
      <Outlet />
    </Dashboard>
  )
}
