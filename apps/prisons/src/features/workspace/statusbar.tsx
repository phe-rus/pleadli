import { useHqConfig, useSession } from '@/features/session'
import { format } from 'date-fns/format'
import { useWorkspace } from './tabs-store'

/** The thin strip along the bottom of the window: who this installation is,
 * and a little of the working context — the number of open records and
 * today's date (Obsidian's bottom-right status bar in miniature). */
export function StatusBar() {
  const { tabs } = useWorkspace()
  const { data: hqConfig } = useHqConfig()
  const { data: session } = useSession()

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border/20 bg-background px-3 text-xs tracking-wide text-muted-foreground">
      <span className="truncate">
        {hqConfig?.isHeadOffice ? 'Head Office' : 'Facility node'}
        {session ? ` · Badge ${session.officer.badgeNumber}` : ''}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {tabs.length > 0 && (
          <span>
            {tabs.length} tab{tabs.length === 1 ? '' : 's'}
          </span>
        )}
        <span>{format(new Date(), 'EEEE d MMM yyyy')}</span>
      </span>
    </footer>
  )
}