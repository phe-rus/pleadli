import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Link } from '@tanstack/react-router'
import { format } from '@/lib/date'
import { m } from '@/paraglide/messages'
import type { Estate } from './schema'

/** Across the whole Service, the people past a limit the law sets: on remand
 * past the bail limit, or held past their release date. Each with the prison
 * that holds them, so Head Office knows whom to call. */
export function ServiceCannotWait({ estate }: { estate: Estate }) {
  const people = estate.regions
    .flatMap((region) => region.facilities.flatMap((facility) => facility.urgent.map((person) => ({ ...person, facility }))))
    .sort((a, b) => a.since - b.since)
  if (people.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5 rounded-xl bg-destructive/[0.06] p-1.5 ring-1 ring-destructive/25">
      <div className="flex flex-col px-2.5 pt-1.5">
        <h2 className="text-[0.9375rem] font-semibold text-destructive">{m.today_cannot_wait()}</h2>
        <p className="text-[0.8125rem] text-muted-foreground">{m.service_cannot_wait_note()}</p>
      </div>
      <Group>
        {people.map((person, i) => (
          <GroupRow
            key={`${person.facility.id}:${person.name}:${i}`}
            label={
              <span>
                <span className="font-medium">{person.name}</span>
                {person.number && <span className="text-muted-foreground tabular-nums"> · {person.number}</span>}
              </span>
            }
            detail={(person.kind === 'overheld' ? m.service_overheld : m.service_past_bail)({ since: format(person.since, 'd MMM yyyy') })}
            value={
              <Link to="/facilities" className="text-[0.8125rem] no-underline">
                {person.facility.name}
              </Link>
            }
          />
        ))}
      </Group>
    </section>
  )
}

/** The Service in four figures, summed only over the prisons that reported
 * them, and how many those are, so the picture is never made to look better
 * than what Head Office has actually heard. */
export function ServiceFigures({ estate }: { estate: Estate }) {
  const facilities = estate.regions.flatMap((r) => r.facilities)
  const reporting = facilities.filter((f) => f.held != null)
  const held = reporting.reduce((sum, f) => sum + (f.held ?? 0), 0)
  const remand = reporting.reduce((sum, f) => sum + (f.unconvicted ?? 0), 0)
  const withCapacity = reporting.filter((f) => f.capacity)
  const capacity = withCapacity.reduce((sum, f) => sum + (f.capacity ?? 0), 0)
  const heldThere = withCapacity.reduce((sum, f) => sum + (f.held ?? 0), 0)
  const figures: [string, string][] = [
    [m.service_held(), String(held)],
    [m.service_remand(), held > 0 ? `${remand} · ${Math.round((remand / held) * 100)}%` : String(remand)],
    [m.service_occupancy(), capacity > 0 ? `${Math.round((heldThere / capacity) * 100)}%` : '·'],
    [m.service_reporting(), m.service_of({ part: reporting.length, whole: facilities.length })],
  ]
  return (
    <Group title={m.service_figures()} footer={m.service_figures_note()}>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {figures.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 px-3.5 py-3">
            <span className="text-[1.375rem] leading-7 font-semibold tabular-nums">{value}</span>
            <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </Group>
  )
}
