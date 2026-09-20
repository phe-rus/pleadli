import { OfficerAvatar, officerRoleLabel } from '@/features/officers'
import { useSession, useSignOut } from '@/features/session'
import { Logout03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { m } from '@/paraglide/messages'

/** Sidebar footer: who is signed in, and below it a way to sign out. The
 * profile is plain (no fill, nothing to click); sign out is its own small
 * destructive button so it is never hit by accident while reaching for the
 * name. Every installation has a real signed-in officer, facility or Head
 * Office; node and backup state live in the status bar. */
export function SidebarUserFooter() {
  const { data: session } = useSession()
  const signOut = useSignOut()

  if (!session) return null
  const { officer } = session

  return (
    <div className="flex w-full flex-col gap-2 px-1 py-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <OfficerAvatar officer={officer} size={24} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium">{officer.name}</span>
          <span className="truncate text-xs text-muted-foreground">{m.ui_badge({ badgeNumber: officer.badgeNumber, role: officerRoleLabel(officer.role) })}</span>
        </div>
      </div>
      <Button size="sm" variant="destructive" onClick={() => signOut.mutate()} disabled={signOut.isPending} className="w-fit cursor-pointer">
        <HugeiconsIcon icon={Logout03Icon} />
        {m.ui_sign_out()}
      </Button>
    </div>
  )
}
