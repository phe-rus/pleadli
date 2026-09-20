import { ConnectionIndicator } from '@/features/connectivity'
import { InboxCount } from '@/features/notifications'
import { useSession } from '@/features/session'
import { format } from 'date-fns/format'
import { m } from '@/paraglide/messages'

/** The thin strip along the bottom of the window: who is signed in, the
 * connection, the date. Nothing here competes with the work. */
export function StatusBar() {
  const { data: session } = useSession()

  return (
    <footer className="flex h-7 print:hidden shrink-0 items-center justify-between gap-3 border-t border-border/20 bg-background px-3 text-xs tracking-wide text-muted-foreground">
      <span className="truncate">{session ? m.shell_signed_in_as({ name: session.officer.name, badge: session.officer.badgeNumber }) : ''}</span>
      <span className="flex shrink-0 items-center gap-3">
        <InboxCount />
        <ConnectionIndicator />
        <span>{format(new Date(), 'EEEE d MMM yyyy')}</span>
      </span>
    </footer>
  )
}
