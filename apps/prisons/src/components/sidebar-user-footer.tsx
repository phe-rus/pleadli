import { EnvironmentStrip } from '@/features/node'
import { OfficerAvatar, officerRoleLabel } from '@/features/officers'
import { useSession, useSignOut } from '@/features/session'
import { Logout03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'

/** Sidebar footer: who is signed in, and a way to sign out. Every
 * installation has a real signed-in officer now, facility or Head Office. */
export function SidebarUserFooter() {
  const { data: session } = useSession()
  const signOut = useSignOut()

  if (!session) return null
  const { officer } = session

  return (
    <div className="flex w-full flex-col gap-2">
    <EnvironmentStrip />
    <div className="flex w-full items-center justify-between gap-2 px-1 py-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <OfficerAvatar officer={officer} size={32} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{officer.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            Badge {officer.badgeNumber} · {officerRoleLabel(officer.role)}
          </span>
        </div>
      </div>
      <Button
        size="icon-sm"
        variant="destructive"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
        aria-label="Sign out"
        title="Sign out"
      >
        <HugeiconsIcon icon={Logout03Icon} />
      </Button>
    </div>
    </div>
  )
}
