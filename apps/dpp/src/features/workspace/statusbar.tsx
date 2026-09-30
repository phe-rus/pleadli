import { useSecurityStatus } from '@/features/security'
import { useBrand } from '@/features/installation'
import { formatDate } from '@/lib/dates'
import * as m from '@/paraglide/messages'
import { plural } from '@/lib/present'
import { workloadOptions } from '@/features/workload'
import { useQuery } from '@tanstack/react-query'
import { StatusBarLanguageSelect } from '@/features/i18n'

/** The thin strip along the bottom of the window: who is working, how much is
 * waiting, the date. Nothing here competes with the work. */
export function StatusBar() {
  const { data: status } = useSecurityStatus()
  const { data: brand } = useBrand()
  const actor = status?.actor
  const { data: workload } = useQuery(workloadOptions())

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border/20 bg-background px-3 text-xs tracking-wide text-muted-foreground print:hidden">
      <span className="truncate">{[brand?.officeName, actor ? `${actor.name}${actor.rank ? `, ${actor.rank}` : ''}` : null].filter(Boolean).join(' · ')}</span>
      <span className="flex shrink-0 items-center gap-3">
        {workload && <span>{plural(workload.awaitingDecision, m["count.awaiting_file.one"], m["count.awaiting_file.many"])}</span>}
        <span>{formatDate(new Date(), 'weekday')}</span>
        <StatusBarLanguageSelect />
      </span>
    </footer>
  )
}
