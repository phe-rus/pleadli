import { usePermissions } from '@/features/session'
import { Badge } from '@pleadli/ui/badge'
import { Card, CardContent } from '@pleadli/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pleadli/ui/table'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { m } from '@/paraglide/messages'
import { useEstate } from './queries'
import type { Attention, Contact, Estate, EstateFacility, EstateRegion, ReturnState } from './schema'

/** How long ago, in words. Every figure on this page says how old it is,
 * because Head Office only ever knows a facility as it was when last heard from. */
function ago(ms: number | null) {
  return ms === null ? null : formatDistanceToNowStrict(ms, { addSuffix: true })
}

function monthOf(from: number) {
  return format(from, 'MMMM yyyy')
}

function attentionText(item: Attention, estate: Estate) {
  const when = ago(item.since) ?? ''
  switch (item.kind) {
    case 'silent':
      return m.estate_attention_silent({ when })
    case 'never_contacted':
      return m.estate_attention_never()
    case 'pending_verification':
      return m.estate_attention_pending()
    case 'return_overdue':
      return m.estate_attention_return({ month: monthOf(estate.returnPeriodFrom) })
    case 'over_capacity':
      return m.estate_attention_over({ percent: item.figure ?? 0, when })
  }
}

const attentionLabel = {
  silent: () => m.estate_kind_silent(),
  never_contacted: () => m.estate_kind_silent(),
  pending_verification: () => m.estate_kind_verification(),
  return_overdue: () => m.estate_kind_return(),
  over_capacity: () => m.estate_kind_capacity(),
} as const

function ContactCell({ facility }: { facility: EstateFacility }) {
  const labels: Record<Contact, string | null> = {
    current: m.estate_contact_current(),
    stale: m.estate_contact_stale(),
    silent: m.estate_contact_silent(),
    never: m.estate_contact_never(),
    not_applicable: null,
  }
  const label = labels[facility.contact]
  if (!label) return <span className="text-muted-foreground">{m.estate_not_connected_yet()}</span>
  const variant = facility.contact === 'current' ? 'secondary' : facility.contact === 'stale' ? 'outline' : 'destructive'
  return (
    <div className="flex flex-col gap-0.5">
      <div>
        <Badge variant={variant}>{label}</Badge>
      </div>
      {facility.lastContactAt !== null && <span className="text-muted-foreground">{ago(facility.lastContactAt)}</span>}
    </div>
  )
}

function PopulationCell({ facility }: { facility: EstateFacility }) {
  if (facility.held === null) return <span className="text-muted-foreground">{m.estate_not_reported()}</span>
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tabular-nums">
        {facility.capacity === null ? m.estate_held_no_capacity({ held: facility.held }) : m.estate_held_of({ held: facility.held, capacity: facility.capacity })}
      </span>
      <span className="text-muted-foreground">{ago(facility.populationAsAt)}</span>
    </div>
  )
}

function OccupancyCell({ percent }: { percent: number | null }) {
  if (percent === null) return <span className="text-muted-foreground">{m.estate_unknown()}</span>
  return <Badge variant={percent > 100 ? 'destructive' : 'secondary'}>{m.estate_percent({ percent })}</Badge>
}

function ReturnCell({ facility, estate }: { facility: EstateFacility; estate: Estate }) {
  const state: ReturnState = facility.returnState
  if (state === 'not_due') return <span className="text-muted-foreground">{m.estate_no_return_due()}</span>
  const month = monthOf(estate.returnPeriodFrom)
  if (state === 'received' && facility.latestReturn) {
    return (
      <div className="flex flex-col gap-0.5">
        <Link to="/reports/$id" params={{ id: facility.latestReturn.id }}>
          <Badge variant="secondary">{m.estate_return_received({ month })}</Badge>
        </Link>
        <span className="text-muted-foreground">{ago(facility.latestReturn.receivedAt)}</span>
      </div>
    )
  }
  return <Badge variant={state === 'overdue' ? 'destructive' : 'outline'}>{state === 'overdue' ? m.estate_return_overdue({ month }) : m.estate_return_awaited({ month })}</Badge>
}

function RegionCard({ region, estate }: { region: EstateRegion; estate: Estate }) {
  return (
    <Card className="p-0">
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3>{region.region}</h3>
          <p className="text-muted-foreground">
            {m.estate_region_summary({ inContact: region.inContact, counted: region.counted })}
            {region.occupancyPercent !== null
              ? ` · ${m.estate_region_occupancy({ percent: region.occupancyPercent, reporting: region.reporting, counted: region.counted })}`
              : ` · ${m.estate_region_occupancy_unknown()}`}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{m.estate_facility()}</TableHead>
              <TableHead>{m.estate_contact()}</TableHead>
              <TableHead>{m.estate_held()}</TableHead>
              <TableHead>{m.estate_occupancy()}</TableHead>
              <TableHead>{m.estate_returns()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {region.facilities.map((facility) => (
              <TableRow key={facility.id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span>{facility.name}</span>
                    <span className="text-muted-foreground">{[facility.facilityNumber, facility.location].filter(Boolean).join(' · ')}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ContactCell facility={facility} />
                </TableCell>
                <TableCell>
                  <PopulationCell facility={facility} />
                </TableCell>
                <TableCell>
                  <OccupancyCell percent={facility.occupancyPercent} />
                </TableCell>
                <TableCell>
                  <ReturnCell facility={facility} estate={estate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/**
 * The Head Office home: what needs attention first, then every region and the
 * facilities in it. A figure is shown with how old it is, and one that has not
 * been reported is shown as not reported, never as zero. Pairing and the
 * roster live under Facilities, not here.
 */
export function EstateBoard() {
  const { can } = usePermissions()
  const { data: estate, isPending, isError } = useEstate(can('hq.estate.read'))

  if (isPending) return null
  if (isError || !estate) return <p>{m.estate_could_not_load()}</p>

  const nothing = estate.attention.length === 0 && estate.connectionRequestsWaiting === 0

  return (
    <>
      <section className="page-section">
        <div className="section-head">
          <h2>{m.estate_needs_attention()}</h2>
        </div>
        {nothing ? (
          <p>{m.estate_nothing_needs_attention()}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {estate.connectionRequestsWaiting > 0 && (
              <li className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive">{m.estate_kind_request()}</Badge>
                <Link to="/facilities" className="underline-offset-4 hover:underline">
                  {m.estate_requests_waiting({ count: estate.connectionRequestsWaiting })}
                </Link>
              </li>
            )}
            {estate.attention.map((item) => (
              <li key={`${item.kind}:${item.facilityId}`} className="flex flex-wrap items-center gap-2">
                <Badge variant={item.kind === 'over_capacity' || item.kind === 'pending_verification' ? 'outline' : 'destructive'}>{attentionLabel[item.kind]()}</Badge>
                <span>{item.facilityName}</span>
                <span className="text-muted-foreground">{attentionText(item, estate)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>{m.estate_regions()}</h2>
          <span className="text-muted-foreground">{m.estate_as_of_each_facility()}</span>
        </div>
        {estate.regions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <p>{m.estate_no_facilities()}</p>
            <Link to="/facilities" className="underline-offset-4 hover:underline">
              {m.estate_open_facilities()}
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {estate.regions.map((region) => (
              <RegionCard key={region.region} region={region} estate={estate} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
