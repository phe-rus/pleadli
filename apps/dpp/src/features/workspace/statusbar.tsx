import { useProsecutorProfile } from '@/features/prosecutor-profile'
import { workloadOptions } from '@/features/workload'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns/format'

/** The thin strip along the bottom of the window: who is working, how much is
 * waiting, the date. Nothing here competes with the work. */
export function StatusBar() {
  const { data: profile } = useProsecutorProfile()
  const { data: workload } = useQuery(workloadOptions())

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border/20 bg-background px-3 text-xs tracking-wide text-muted-foreground print:hidden">
      <span className="truncate">{profile ? `${profile.name}${profile.rank ? `, ${profile.rank}` : ''}` : 'No prosecutor set'}</span>
      <span className="flex shrink-0 items-center gap-3">
        {workload && <span>{workload.awaitingDecision === 1 ? '1 file awaiting decision' : `${workload.awaitingDecision} files awaiting decision`}</span>}
        <span>{format(new Date(), 'EEEE d MMM yyyy')}</span>
      </span>
    </footer>
  )
}
