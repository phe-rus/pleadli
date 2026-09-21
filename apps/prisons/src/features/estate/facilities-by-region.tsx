import { Badge } from '@pleadli/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pleadli/ui/table'
import { Link } from '@tanstack/react-router'
import { m } from '@/paraglide/messages'
import { ago, monthOf } from './format'
import type { Contact, Estate, EstateFacility, EstateRegion, ReturnState } from './schema'

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
        <Link to="/reports/$report" params={{ report: facility.latestReturn.id }}>
          <Badge variant="secondary">{m.estate_return_received({ month })}</Badge>
        </Link>
        <span className="text-muted-foreground">{ago(facility.latestReturn.receivedAt)}</span>
      </div>
    )
  }
  return <Badge variant={state === 'overdue' ? 'destructive' : 'outline'}>{state === 'overdue' ? m.estate_return_overdue({ month }) : m.estate_return_awaited({ month })}</Badge>
}

function Region({ region, estate }: { region: EstateRegion; estate: Estate }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3>{region.region}</h3>
        <p>
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
    </div>
  )
}

/** Every facility on the roster under its region: how recently it was heard
 * from, what it holds against what it is approved for, and whether its return
 * for the month that has closed is in. A figure carries how old it is, and one
 * not reported is shown as not reported, never as zero. Pairing and the roster
 * itself are under Facilities. */
export function FacilitiesByRegion({ estate }: { estate: Estate }) {
  return (
    <section className="page-section" aria-labelledby="facilities-heading">
      <div className="section-head">
        <h2 id="facilities-heading">{m.estate_regions()}</h2>
        <Link to="/facilities">{m.estate_open_facilities()}</Link>
      </div>
      {estate.regions.length === 0 ? (
        <p>{m.estate_no_facilities()}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {estate.regions.map((region) => (
            <Region key={region.region} region={region} estate={estate} />
          ))}
        </div>
      )}
    </section>
  )
}
