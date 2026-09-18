import { officerRoleLabel } from '@/features/officers'
import { useCurrentHqSession, useHqConfig, useHqSignOut } from '@/features/session'
import { Logout03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'

/** Sidebar footer: who's signed in, and a way to sign out. Only Head
 * Office has a persistent, signed-in identity to show (spec: docs/specs/
 * prisons/0001-head-office-peer-sync-network/index.md's cross child
 * contract) — a facility installation re-asks for admin credentials
 * per-visit rather than holding a session, so there's no "current user"
 * to display there. */
export function SidebarUserFooter() {
  const { data: hqConfig } = useHqConfig()
  const isHeadOffice = hqConfig?.isHeadOffice ?? false
  const { data: session } = useCurrentHqSession(isHeadOffice)
  const hqSignOut = useHqSignOut()

  if (!isHeadOffice || !session) return null

  return (
    <div className="flex w-full items-center justify-between gap-2 px-1 py-0.5">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{session.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          Badge {session.badgeNumber} · {officerRoleLabel(session.role)}
        </span>
      </div>
      <Button
        size="icon-sm"
        variant="destructive"
        onClick={() => hqSignOut.mutate()}
        disabled={hqSignOut.isPending}
        aria-label="Sign out"
        title="Sign out"
      >
        <HugeiconsIcon icon={Logout03Icon} />
      </Button>
    </div>
  )
}
