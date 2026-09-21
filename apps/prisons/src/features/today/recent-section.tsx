import { Row, RowList } from '@/components/operational-row'
import { healthEventTypeLabel } from '@/features/health-events'
import type { RecentEvent, TodayView } from '@/features/obligations'
import { releaseTypeLabel } from '@/features/releases'
import { requestCategoryLabel } from '@/features/requests'
import { visitTypeLabel } from '@/features/visits'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { m } from '@/paraglide/messages'

const kindLabel: Record<RecentEvent['kind'], () => string> = {
  admitted: () => m.recent_kind_admitted(),
  discharged: () => m.recent_kind_discharged(),
  transfer_out: () => m.recent_kind_transfer_out(),
  transfer_in: () => m.recent_kind_transfer_in(),
  court: () => m.recent_kind_court(),
  visit: () => m.recent_kind_visit(),
  request_raised: () => m.recent_kind_request_raised(),
  request_resolved: () => m.recent_kind_request_resolved(),
  health: () => m.recent_kind_health(),
}

/** The record's own type or state, in the words the rest of the app uses for
 * it. A record with none says nothing more. */
function detailOf({ kind, detail }: RecentEvent): string | null {
  if (!detail) return null
  switch (kind) {
    case 'discharged':
      return releaseTypeLabel(detail)
    case 'transfer_out':
      return m.recent_to_prison({ prison: detail })
    case 'transfer_in':
      return m.recent_from_prison({ prison: detail })
    case 'court':
      return detail === 'not_produced' ? m.recent_court_not_produced() : m.recent_court_produced()
    case 'visit':
      return visitTypeLabel(detail)
    case 'request_raised':
    case 'request_resolved':
      return requestCategoryLabel(detail)
    case 'health':
      return healthEventTypeLabel(detail)
    default:
      return null
  }
}

/** What changed lately, newest first, from the records themselves: an
 * admission, a discharge, a transfer, a court outcome, a completed visit, a
 * request, a health movement. The 30-day totals sit above it. */
export function RecentSection({ today }: { today: TodayView }) {
  const { recent } = today
  return (
    <section className="page-section" aria-labelledby="recent-heading">
      <div className="section-head">
        <h2 id="recent-heading">{m.recent_heading()}</h2>
        <p>{m.recent_last_30_days({ admitted: recent.admitted, discharged: recent.discharged, sent: recent.transferredOut, received: recent.transferredIn })}</p>
      </div>
      {recent.events.length === 0 ? (
        <p>{m.recent_empty()}</p>
      ) : (
        <RowList>
          {recent.events.map((event) => (
            <Row
              key={`${event.kind}:${event.at}:${event.prisonerId ?? ''}:${event.detail ?? ''}`}
              title={kindLabel[event.kind]()}
              summary={
                <>
                  {event.prisonerId && event.prisonerName ? (
                    <Link to="/prisoners/$prisonerId" params={{ prisonerId: event.prisonerId }}>
                      {event.prisonerName}
                    </Link>
                  ) : (
                    event.prisonerName
                  )}
                  {[event.prisonerName, detailOf(event)].every(Boolean) ? ' · ' : ''}
                  {detailOf(event)}
                </>
              }
              trailing={
                <time dateTime={new Date(event.at).toISOString()} title={format(event.at, 'PPp')} className="tabular-nums text-muted-foreground">
                  {formatDistanceToNowStrict(event.at, { addSuffix: true })}
                </time>
              }
            />
          ))}
        </RowList>
      )}
    </section>
  )
}
