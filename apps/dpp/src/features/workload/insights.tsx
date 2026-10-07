import { plural } from '@/lib/present'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'
import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'
import type { Spread } from './schema'

/** A white card for one chart or figure, with its title above it like a group. */
export function Panel({ title, hint, children, className }: { title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <h2 data-slot="group-title" className="px-1">
        {title}
      </h2>
      <div className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-xs ring-1 ring-border/70">{children}</div>
      {hint && (
        <p data-slot="group-footer" className="px-1 text-muted-foreground">
          {hint}
        </p>
      )}
    </section>
  )
}

/** One label, a bar and its count: the shape every breakdown here takes. */
export function BarRow({ label, value, max, className }: { label: string; value: number; max: number; className?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr_2rem] items-center gap-3">
      <span className="truncate" title={label}>
        {label}
      </span>
      <Bar value={value} max={max} className={className} />
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

export function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <span aria-hidden className="block h-2 w-full rounded-full bg-secondary">
      <span className={cn('block h-2 rounded-full bg-primary', className)} style={{ width: `${max === 0 ? 0 : Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%` }} />
    </span>
  )
}

export const monthLabel = (ms: number, short = false) => new Date(ms).toLocaleString(getLocale(), { month: 'short', ...(short ? {} : { year: 'numeric' }), timeZone: 'UTC' })
const days = (value: number | null) => (value === null ? m["capacity.none_yet"]() : m["capacity.days"]({ days: value < 10 ? value.toFixed(1) : String(Math.round(value)) }))
const bandLabels = () => [m["capacity.turnaround_band.week"](), m["capacity.turnaround_band.two_weeks"](), m["capacity.turnaround_band.four_weeks"](), m["capacity.turnaround_band.longer"]()]

type CountMessage = (params: { count: number }) => string

/** How long something took, over the period: the middle case, the average, the
 * longest, and how the cases spread. */
export function TurnaroundCard({ title, about, what, spread }: { title: string; about: string; what: [CountMessage, CountMessage]; spread: Spread }) {
  const max = Math.max(1, ...spread.bands)
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 shadow-xs ring-1 ring-border/70">
      <div className="flex flex-col gap-1">
        <h3>{title}</h3>
        <p>{about}</p>
      </div>
      {spread.count === 0 ? (
        <p>{m["capacity.nothing_to_measure"]()}</p>
      ) : (
        <>
          <p>
            <span className="text-2xl font-semibold text-foreground tabular-nums">{days(spread.medianDays)}</span> {m["capacity.spread"]({ across: plural(spread.count, ...what), average: days(spread.meanDays), longest: days(spread.longestDays) })}
          </p>
          <div className="flex flex-col gap-1.5">
            {bandLabels().map((label, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3">
                <span>{label}</span>
                <Bar value={spread.bands[i]} max={max} />
                <span className="text-right tabular-nums">{spread.bands[i]}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

