import { authClient } from '@/auth/client'
import { adminNav } from '@/data/admin'
import { stopImpersonating } from '@/functions/admin.func'
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
      brand={{ to: '/admin', label: 'Pleadli staff', icon: JusticeScale01Icon }}
      itemLists={adminNav}
      addOns={{
        enableNavigation: true,
        footer: (
          <div className="flex flex-col gap-0.5 border-t border-border/60 pt-3">
            <span className="truncate px-2 text-[0.8125rem] text-muted-foreground">{session.user.email}</span>
            <button type="button" onClick={signOut} disabled={isPending} className="cursor-pointer rounded-lg px-2 py-1.5 text-start text-[0.8125rem] text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground">
              {isPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        ),
        banner: impersonatedBy && (
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
                await stopImpersonating()
                window.location.reload()
              }}
            >
              {isStoppingImpersonation ? 'Stopping…' : 'Stop impersonating'}
            </Button>
          </div>
        )
      }}
    >
      <Outlet />
    </Dashboard>
  )
}
