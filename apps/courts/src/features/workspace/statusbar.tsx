import { useOverviewSoft } from '@/features/overview'
import { useProfile } from '@/features/profile'
import { format } from 'date-fns/format'

/** The thin strip along the bottom of the window: who is sitting, what is
 * listed today, the date. Nothing here competes with the work. */
export function StatusBar() {
  const { data: profile } = useProfile()
  const { data: today } = useOverviewSoft()
  const listed = today?.counts.sittingsToday

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border/20 bg-background px-3 text-xs tracking-wide text-muted-foreground print:hidden">
      <span className="truncate">{profile ? `${profile.name}${profile.title ? `, ${profile.title}` : ''}` : 'No judicial officer set'}</span>
      <span className="flex shrink-0 items-center gap-3">
        {listed != null && <span>{listed === 1 ? '1 sitting today' : `${listed} sittings today`}</span>}
        <span>{format(new Date(), 'EEEE d MMM yyyy')}</span>
      </span>
    </footer>
  )
}
