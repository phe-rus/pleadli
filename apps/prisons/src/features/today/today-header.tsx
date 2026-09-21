import { stateCopy, useConnectivityStatus } from '@/features/connectivity'
import type { TodayView } from '@/features/obligations'
import { officerRoleLabel } from '@/features/officers'
import { usePermissions } from '@/features/session'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import type { ReactNode } from 'react'
import { m } from '@/paraglide/messages'

/** The Head Office connection in one clause: how it stands, and the one fact
 * worth knowing beside it (changes waiting, else the last exchange). It opens
 * the connection settings; the status bar has the fuller popover. */
function ConnectionNote() {
  const { data: status } = useConnectivityStatus()
  if (!status) return null
  const copy = stateCopy[status.state]
  const detail =
    status.pending.total > 0
      ? m.connectivity_changes_waiting({ total: status.pending.total })
      : status.state === 'connected' && status.lastExchangeAt
        ? m.today_last_exchange({ when: formatDistanceToNowStrict(status.lastExchangeAt, { addSuffix: true }) })
        : null
  return (
    <Link to="/settings/$section" params={{ section: 'head-office' }} className="inline-flex items-center gap-1.5">
      <span className={cn('size-2 rounded-full', copy.dot)} aria-hidden />
      {[copy.label, detail].filter(Boolean).join(' · ')}
    </Link>
  )
}

/** Where the officer is: the date, this facility, who is signed in, and how
 * it stands with Head Office. Restrained on purpose: one line of context
 * under the name, and the actions to the right. */
export function TodayHeader({ today, actions }: { today: TodayView; actions: ReactNode }) {
  const { session } = usePermissions()
  const officer = session?.officer
  return (
    <header className="page-header">
      <div>
        <p>
          {m.today_today()} · {format(today.now, 'EEEE d MMMM yyyy')}
        </p>
        <h1>{today.facility.name ?? m.today_today()}</h1>
        <p>
          {officer && (
            <>
              {m.today_signed_in_as({ name: officer.name, role: officerRoleLabel(officer.role) })}
              {' · '}
            </>
          )}
          <ConnectionNote />
        </p>
      </div>
      <div className="page-actions">{actions}</div>
    </header>
  )
}
