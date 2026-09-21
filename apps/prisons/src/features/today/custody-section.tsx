import type { TodayView } from '@/features/obligations'
import { present } from '@/lib/present'
import { Link } from '@tanstack/react-router'
import { m } from '@/paraglide/messages'

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <h3 className="tabular-nums">{value}</h3>
      <p>{label}</p>
    </div>
  )
}

/** Who is held now, and how that compares with what the facility is approved
 * for. One band of figures and one line beneath, not a set of tiles: the
 * remand line is the only place a threshold shows here, and it counts people
 * the node has already listed under Attention. */
export function CustodySection({ today }: { today: TodayView }) {
  const { population: pop, remand } = today
  const occupancy = pop.capacity ? Math.round((pop.held / pop.capacity) * 100) : null
  const share = (n: number) => (pop.held > 0 ? `${(n / pop.held) * 100}%` : '0%')
  const notes = present([
    occupancy !== null ? m.custody_occupancy({ percent: occupancy, capacity: pop.capacity ?? 0 }) : m.today_approved_capacity_not_set(),
    remand.pastThreshold > 0 && m.custody_past_threshold({ count: remand.pastThreshold }),
    remand.within14Days > 0 && m.custody_within_14_days({ count: remand.within14Days }),
    remand.longestHeldDays != null && m.custody_longest_remand({ days: remand.longestHeldDays }),
  ])

  return (
    <section className="page-section" aria-labelledby="custody-heading">
      <div className="section-head">
        <h2 id="custody-heading">{m.custody_heading()}</h2>
        <Link to="/prisoners">{m.custody_open_population()}</Link>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/60 py-4 sm:grid-cols-4 sm:[&>*+*]:border-l sm:[&>*+*]:border-border/60 sm:[&>*+*]:pl-6">
        <Figure value={pop.held} label={m.custody_held()} />
        <Figure value={pop.convicted} label={m.custody_convicted()} />
        <Figure value={pop.unconvicted} label={m.custody_remand()} />
        <Figure value={pop.civil} label={m.custody_civil()} />
      </div>
      {pop.held > 0 && (
        <div aria-hidden className="flex h-1 w-full overflow-hidden rounded-full bg-secondary">
          <span className="bg-foreground/70" style={{ width: share(pop.convicted) }} />
          <span className="bg-foreground/40" style={{ width: share(pop.unconvicted) }} />
          <span className="bg-foreground/20" style={{ width: share(pop.civil) }} />
        </div>
      )}
      <p>{notes.join(' · ')}</p>
    </section>
  )
}
