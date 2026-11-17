import * as m from '@/paraglide/messages'
import { useBrand } from '@/features/installation'
import { LicenceBar } from '@/features/orchestra'
import { useSecurityStatus } from '@/features/security'
import { workloadOptions } from '@/features/workload'
import { useIntakeAlerts } from '@/hooks/use-intake-alerts'
import { formatDate } from '@/lib/dates'
import { plural } from '@/lib/present'
import { useQuery } from '@tanstack/react-query'

export { LicenceBar }
export { AssistHeader, AssistSidePanel } from '@/features/assist/dock'

/** Nothing is drawn here: it watches for referrals arriving and says so natively. */
export function HeaderEnd() {
  useIntakeAlerts()
  return null
}

/** The thin strip along the bottom of the window: who is working, how much is
 * waiting, the date. Nothing here competes with the work. */
export function StatusBar() {
  const { data: status } = useSecurityStatus()
  const { data: brand } = useBrand()
  const { data: workload } = useQuery(workloadOptions())
  const actor = status?.actor
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{[brand?.officeName, actor ? `${actor.name}${actor.rank ? `, ${actor.rank}` : ''}` : null].filter(Boolean).join(' · ')}</span>
      {workload && <span>{plural(workload.awaitingDecision, m["count.awaiting_file.one"], m["count.awaiting_file.many"])}</span>}
      <span>{formatDate(new Date(), 'weekday')}</span>
    </>
  )
}
