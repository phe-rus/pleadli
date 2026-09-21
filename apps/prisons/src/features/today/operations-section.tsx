import { Row, RowList } from '@/components/operational-row'
import type { TodayView } from '@/features/obligations'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { present } from '@/lib/present'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { m } from '@/paraglide/messages'

type Destination = '/legal' | '/visits' | '/movements' | '/requests' | '/prisoners'
type Operation = { key: string; title: string; parts: string[]; to?: Destination }

/** What is happening, from what the node counted. A row exists only when there
 * is something to say, and says only what was counted: nothing is scheduled,
 * estimated or filled in. */
function operationsOf({ day, movements, court, care, population }: TodayView): Operation[] {
  const rows: Operation[] = [
    {
      key: 'court',
      title: m.ops_court(),
      to: '/legal',
      parts: present([
        movements.courtToday > 0 && m.ops_scheduled_today({ count: movements.courtToday }),
        movements.courtDoneToday > 0 && m.ops_outcomes_recorded({ count: movements.courtDoneToday }),
        court.awaitingOutcome > 0 && m.ops_outcomes_owed({ count: court.awaitingOutcome }),
        movements.courtToday + movements.courtDoneToday === 0 && court.next7Days > 0 && m.ops_next_7_days({ count: court.next7Days }),
      ]),
    },
    {
      key: 'visits',
      title: m.ops_visits(),
      to: '/visits',
      parts: present([care.visitsToday > 0 && m.ops_visits_today({ count: care.visitsToday }), care.visitsCompletedToday > 0 && m.ops_visits_completed({ count: care.visitsCompletedToday })]),
    },
    { key: 'admissions', title: m.ops_admissions(), to: '/prisoners', parts: day.admitted > 0 ? [m.ops_received_today({ count: day.admitted })] : [] },
    { key: 'discharges', title: m.ops_discharges(), parts: day.discharged > 0 ? [m.ops_discharged_today({ count: day.discharged })] : [] },
    {
      key: 'transfers',
      title: m.ops_transfers(),
      to: '/movements',
      parts: present([
        movements.preparing > 0 && m.ops_transfers_preparing({ count: movements.preparing }),
        movements.inTransit > 0 && m.ops_transfers_in_transit({ count: movements.inTransit }),
        movements.awaitingConfirmation > 0 && m.ops_transfers_awaiting({ count: movements.awaitingConfirmation }),
        day.transferredOut > 0 && m.ops_transferred_out_today({ count: day.transferredOut }),
        day.transferredIn > 0 && m.ops_transferred_in_today({ count: day.transferredIn }),
      ]),
    },
    { key: 'hospital', title: m.ops_hospital(), parts: population.hospitalised > 0 ? [m.ops_at_hospital({ count: population.hospitalised })] : [] },
    {
      key: 'requests',
      title: m.ops_requests(),
      to: '/requests',
      parts: present([
        care.openRequests > 0 && m.ops_requests_open({ count: care.openRequests }),
        care.openRequests > 0 && care.oldestOpenRequestAt != null && m.ops_requests_oldest({ age: formatDistanceToNowStrict(care.oldestOpenRequestAt) }),
      ]),
    },
  ]
  return rows.filter((row) => row.parts.length > 0)
}

/** What is happening today, one line for each kind of work there is any of,
 * each leading to where it is done. */
export function OperationsSection({ today }: { today: TodayView }) {
  const rows = operationsOf(today)
  return (
    <section className="page-section" aria-labelledby="operations-heading">
      <div className="section-head">
        <h2 id="operations-heading">{m.ops_heading()}</h2>
      </div>
      {rows.length === 0 ? (
        <p>{m.ops_empty()}</p>
      ) : (
        <RowList>
          {rows.map((row) => (
            <Row
              key={row.key}
              title={row.title}
              summary={row.parts.join(' · ')}
              trailing={
                row.to && (
                  <Link to={row.to} className="inline-flex items-center gap-1 text-muted-foreground transition-colors duration-100 hover:text-foreground motion-reduce:transition-none">
                    {m.ops_open()}
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
                  </Link>
                )
              }
            />
          ))}
        </RowList>
      )}
    </section>
  )
}
