import { reportsSummaryOptions, type ReportsSummary } from '@/features/reports'
import { usePermissions } from '@/features/session'
import { weekBucketStarts, weeklyBuckets } from '@/lib/weekly-buckets'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import { m } from '@/paraglide/messages'

const WEEKS = 8

type MetricId = 'admissions' | 'discharges' | 'visits' | 'court'

const metrics: readonly { id: MetricId; label: () => string; stroke: string; timestamps: (s: ReportsSummary) => number[] }[] = [
  { id: 'admissions', label: () => m.overview_admissions(), stroke: 'var(--foreground)', timestamps: (s) => s.admissionTimestamps },
  { id: 'discharges', label: () => m.overview_discharges(), stroke: 'var(--primary)', timestamps: (s) => s.releaseTimestamps },
  { id: 'visits', label: () => m.overview_visits(), stroke: 'var(--chart-1)', timestamps: (s) => s.visitTimestamps },
  { id: 'court', label: () => m.overview_court(), stroke: 'var(--muted-foreground)', timestamps: (s) => s.courtProductionTimestamps },
]

const W = 640
const H = 176
const PAD = { left: 28, right: 8, top: 10, bottom: 22 }

function change(current: number, previous: number) {
  if (current === previous) return m.overview_same()
  return current > previous ? m.overview_up({ count: current - previous }) : m.overview_down({ count: previous - current })
}

/**
 * The one chart on the home page: what has been coming in and going out over
 * the last eight weeks, four counts to switch on and off, each with how it
 * compares with the eight weeks before. It is drawn from the timestamps the
 * records already carry, so it can never show a figure the registers do not
 * hold. Deeper analysis is not on this page on purpose.
 */
export function OverviewChart() {
  const { can } = usePermissions()
  const { data: summary } = useQuery({ ...reportsSummaryOptions(), enabled: can('report.read') })
  const [shown, setShown] = useState<readonly MetricId[]>(['admissions', 'discharges'])

  const series = useMemo(() => {
    if (!summary) return null
    return metrics.map((metric) => {
      const both = weeklyBuckets(metric.timestamps(summary), WEEKS * 2)
      const weeks = both.slice(WEEKS)
      const total = weeks.reduce((a, b) => a + b, 0)
      return { ...metric, weeks, total, previous: both.slice(0, WEEKS).reduce((a, b) => a + b, 0) }
    })
  }, [summary])
  const starts = useMemo(() => weekBucketStarts(WEEKS), [])

  if (!series) return null
  const active = series.filter((s) => shown.includes(s.id))
  const top = Math.max(1, ...active.flatMap((s) => s.weeks))
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (WEEKS - 1)
  const y = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom)
  const toggle = (id: MetricId) => setShown((now) => (now.includes(id) ? now.filter((m) => m !== id) : [...now, id]))

  return (
    <section className="flex flex-col gap-3" aria-label={m.overview_chart_label({ weeks: WEEKS })}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {series.map((s) => {
          const on = shown.includes(s.id)
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.id)}
              className={cn(
                'flex cursor-pointer flex-col gap-1 border border-border/60 border-t-2 px-3 py-2 text-left transition-colors duration-100 outline-none hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none',
                !on && '!border-t-border/60 text-muted-foreground',
              )}
              style={on ? { borderTopColor: s.stroke } : undefined}
            >
              <span className="text-xs">{s.label()}</span>
              <span className="text-2xl leading-none font-semibold tabular-nums">{s.total}</span>
              <span className="text-xs text-muted-foreground">{change(s.total, s.previous)}</span>
            </button>
          )
        })}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={m.overview_chart_label({ weeks: WEEKS })} className="h-auto w-full">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(top * f)} y2={y(top * f)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(top * f) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              {Math.round(top * f)}
            </text>
          </g>
        ))}
        {starts.map((start, i) =>
          i % 2 === 0 ? (
            <text key={start} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
              {format(start, 'd MMM')}
            </text>
          ) : null,
        )}
        {active.map((s) => (
          <g key={s.id}>
            <polyline fill="none" stroke={s.stroke} strokeWidth={2} strokeLinejoin="round" points={s.weeks.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
            {s.weeks.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.stroke}>
                <title>{`${s.label()}: ${v} · ${m.overview_week_of({ date: format(starts[i], 'd MMM') })}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </section>
  )
}
