import { Row, RowList } from '@/components/operational-row'
import { Badge } from '@pleadli/ui/badge'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { useExchangeOverview } from './queries'
import type { ExchangeOverview } from './schema'
import { m } from '@/paraglide/messages'

type FacilityView = ExchangeOverview['facilities'][number]

const viewCopy = {
  get current() { return m.facilities_exchange_view_current() },
  get stale() { return m.facilities_exchange_view_stale() },
  get silent() { return m.facilities_exchange_view_silent() },
  get never() { return m.facilities_exchange_view_never() },
  get stalled() { return m.facilities_exchange_view_stalled() },
  get not_active() { return m.facilities_exchange_view_not_active() },
} as const

const viaCopy: Record<string, () => string> = {
  lan: () => m.facilities_exchange_via_lan(),
  tunnel: () => m.facilities_exchange_via_tunnel(),
  unknown: () => m.facilities_exchange_via_unknown(),
}

const kindCopy: Record<string, () => string> = {
  roster: () => m.facilities_exchange_kind_roster(),
  status: () => m.facilities_exchange_kind_status(),
  return: () => m.facilities_exchange_kind_return(),
  policy: () => m.facilities_exchange_kind_policy(),
  connection: () => m.facilities_exchange_kind_connection(),
}

const resultCopy: Record<string, () => string> = {
  accepted: () => m.facilities_exchange_taken(),
  duplicate: () => m.facilities_exchange_repeat(),
  refused: () => m.facilities_exchange_refused_result(),
}

function ago(at: number) {
  return formatDistanceToNowStrict(at, { addSuffix: true })
}

/** One line of what is known about a facility's exchange: when something last
 * went through and how, what it says is waiting, and any refusal. */
function summary(facility: FacilityView) {
  const parts: string[] = []
  parts.push(facility.lastSuccessAt ? m.facilities_exchange_last_success({ when: ago(facility.lastSuccessAt) }) : m.facilities_exchange_no_success())
  if (facility.lastVia) parts.push((viaCopy[facility.lastVia] ?? viaCopy.unknown)())
  if (facility.reportedPending) parts.push(m.facilities_exchange_waiting({ count: facility.reportedPending }))
  if (facility.refusedLastDay > 0) parts.push(m.facilities_exchange_refused({ count: facility.refusedLastDay }))
  return parts.join(' · ')
}

/**
 * Head Office's view of the exchange: which facilities are delivering, which
 * have gone quiet, and which are connected but not getting through. It is an
 * audit of the network, not a copy of anyone's records: dates, kinds and
 * whether each thing was taken.
 */
export function ExchangePanel() {
  const { data } = useExchangeOverview()
  if (!data) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3>{m.facilities_exchange_heading()}</h3>
        <p>{m.facilities_exchange_intro()}</p>
      </div>
      {data.facilities.length === 0 ? (
        <p>{m.facilities_exchange_none()}</p>
      ) : (
        <RowList>
          {data.facilities.map((facility) => (
            <Row
              key={facility.facilityId}
              marker={facility.view === 'stalled' || facility.view === 'silent' ? 'urgent' : facility.view === 'stale' ? 'open' : undefined}
              aligned
              title={facility.name}
              summary={
                <>
                  {summary(facility)}
                  {facility.reportedLastError && facility.view === 'stalled' && <span className="block">{facility.reportedLastError}</span>}
                </>
              }
              trailing={<Badge variant={facility.view === 'current' ? 'default' : facility.view === 'stalled' ? 'destructive' : 'secondary'}>{viewCopy[facility.view]}</Badge>}
            />
          ))}
        </RowList>
      )}
      {data.events.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4>{m.facilities_exchange_recent()}</h4>
          <RowList>
            {data.events.slice(0, 12).map((event) => (
              <Row
                key={event.id}
                title={`${event.facilityName} · ${(kindCopy[event.kind] ?? (() => event.kind))()}`}
                summary={[ago(event.at), (viaCopy[event.via] ?? viaCopy.unknown)(), event.detail].filter(Boolean).join(' · ')}
                trailing={<Badge variant={event.result === 'refused' ? 'destructive' : 'secondary'}>{(resultCopy[event.result] ?? (() => event.result))()}</Badge>}
              />
            ))}
          </RowList>
        </div>
      )}
    </section>
  )
}
