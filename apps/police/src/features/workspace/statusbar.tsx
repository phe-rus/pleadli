import * as m from '@/paraglide/messages'
import { stationProfileOptions } from '@/features/station-admin/queries'
import { useQuery } from '@tanstack/react-query'
import { format } from '@/lib/date'
import { useInstallation } from '@/features/session'
import { useStationCounts } from './station-counts'

/** The thin strip along the bottom of the window: which station this is, who
 * is in the cells, the date. Nothing here competes with the work. */
export function StatusBar() {
  const { data: profile } = useQuery(stationProfileOptions())
  const counts = useStationCounts()
  const { data: installation } = useInstallation()
  const command = installation?.mode === 'command'

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border/20 bg-background px-3 text-xs tracking-wide text-muted-foreground print:hidden">
      <span className="flex min-w-0 items-center gap-2">
        <span className={command ? 'rounded-sm bg-amber-500/15 px-1.5 text-amber-700 dark:text-amber-400' : 'rounded-sm bg-primary/10 px-1.5 text-primary'}>{command ? m["workspace.command"]() : m["workspace.station"]()}</span>
        <span className="truncate">{profile?.name ?? (command ? m["workspace.command_not_named"]() : m["workspace.station_not_named"]())}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {!command && counts && <span>{counts.inCells === 1 ? m["workspace.custody_one"]() : m["workspace.custody_n"]({ count: counts.inCells })}</span>}
        {!command && counts && counts.custodyDue > 0 && <span className="text-destructive">{m["workspace.near_limit"]({ count: counts.custodyDue })}</span>}
        <span>{format(new Date(), 'EEEE d MMM yyyy')}</span>
      </span>
    </footer>
  )
}
