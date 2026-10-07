import * as m from '@/paraglide/messages'
import { EmptyNote } from '@/components/planned'
import { bondStatusLabel } from '@/features/bonds/schema'
import { caseStatusLabel } from '@/features/cases/schema'
import { custodyStatusLabel } from '@/features/custody/schema'
import { exhibitStatusLabel } from '@/features/evidence/schema'
import { referralDestinationTypeLabel, referralStatusLabel } from '@/features/referrals/schema'
import { reportsSummaryOptions, useReportsSummary, type LabeledCount } from '@/features/reports'
import { format } from '@/lib/date'
import { DAY_MS, WEEK_MS } from '@/lib/weekly-buckets'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { cn } from '@pleadli/ui/lib/utils'
import { Segmented } from '@pleadli/ui/segmented'
import { Stat } from '@pleadli/ui/stat'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const periods = ['4w', '3m', '12m'] as const
type Period = (typeof periods)[number]

export const Route = createFileRoute('/_public/reports/')({
  validateSearch: (search: Record<string, unknown>): { period?: Period } => (periods.includes(search.period as Period) ? { period: search.period as Period } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...reportsSummaryOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

type Bucket = { start: number; end: number; label: string }

/** The period cut into bars: weeks for the short periods, months for a year. */
function bucketsFor(period: Period): Bucket[] {
  const now = Date.now()
  if (period === '12m') {
    const first = new Date()
    first.setDate(1)
    first.setHours(0, 0, 0, 0)
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(first.getFullYear(), first.getMonth() - (11 - i), 1).getTime()
      const end = new Date(first.getFullYear(), first.getMonth() - (10 - i), 1).getTime()
      return { start, end, label: format(start, 'MMM') }
    })
  }
  const weeks = period === '4w' ? 4 : 13
  return Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * WEEK_MS
    return { start: end - WEEK_MS, end, label: format(end - WEEK_MS + DAY_MS, 'd MMM') }
  })
}

const within = (timestamps: number[], from: number, to = Infinity) => timestamps.filter((t) => t >= from && t < to).length

/** A titled white panel, as System Settings draws one. */
function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
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

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="grid grid-cols-[minmax(0,12rem)_1fr_2.5rem] items-center gap-3">
      <span className="truncate" title={label}>
        {label}
      </span>
      <span aria-hidden className="block h-2 w-full rounded-full bg-secondary">
        <span className="block h-2 rounded-full bg-primary" style={{ width: `${max === 0 ? 0 : Math.max(value > 0 ? 4 : 0, (value / max) * 100)}%` }} />
      </span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

/** Where things stand now, as a short list: each state and how many are in it. */
function Standing({ title, counts, label, to }: { title: string; counts: LabeledCount[]; label: (raw: string) => string; to: string }) {
  if (counts.every((c) => c.count === 0)) return null
  return (
    <Group title={title}>
      {counts
        .filter((c) => c.count > 0)
        .map((c) => (
          <GroupRow
            key={c.label}
            label={label(c.label)}
            value={<span className="font-medium text-foreground tabular-nums">{c.count}</span>}
            render={({ className, children }) => (
              <Link to={to as never} className={className}>
                {children}
              </Link>
            )}
          />
        ))}
    </Group>
  )
}

/**
 * How the station's work went over a period, and where things stand now.
 * Everything is counted from the records when the page opens; nothing here is
 * entered by hand, and there is no target, so none is implied.
 */
function RouteComponent() {
  const navigate = useNavigate()
  const { period = '3m' } = Route.useSearch()
  const { data: s } = useReportsSummary()
  const buckets = bucketsFor(period)
  const from = buckets[0].start

  const figures = [
    { label: m["reports.diary_entries"](), value: within(s.stationDiaryTimestamps, from), to: '/sd-log' },
    { label: m["reports.cases_opened"](), value: within(s.caseTimestamps, from), to: '/investigations?view=all' },
    { label: m["reports.arrests"](), value: within(s.custodyTimestamps, from), to: '/search/custody' },
    { label: m["nav.statements"](), value: within(s.statementTimestamps, from), to: '/statements' },
  ]
  const also = [
    { label: m["nav.incidents"](), value: within(s.incidentTimestamps, from), to: '/incidents' },
    { label: m["reports.bonds_granted"](), value: within(s.bondTimestamps, from), to: '/search/bonds' },
    { label: m["reports.evidence_recovered"](), value: within(s.exhibitTimestamps, from), to: '/evidence' },
    { label: m["nav.charge_sheets"](), value: within(s.chargeSheetTimestamps, from), to: '/legal-forms' },
    { label: m["nav.referrals"](), value: within(s.referralTimestamps, from), to: '/referrals' },
  ].filter((row) => row.value > 0)

  const flow = buckets.map((b) => ({ ...b, diary: within(s.stationDiaryTimestamps, b.start, b.end), cases: within(s.caseTimestamps, b.start, b.end) }))
  const flowMax = Math.max(1, ...flow.flatMap((b) => [b.diary, b.cases]))
  const offenceMax = Math.max(1, ...s.topOffences.map((o) => o.count))
  const go = (to: string) => {
    const [path, query = ''] = to.split('?')
    void navigate({ to: path as never, search: Object.fromEntries(new URLSearchParams(query)) as never })
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.statistics"]()}</h1>
          <p>{m["reports.subtitle"]()}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["reports.period"]()}
            value={period}
            onChange={(p) => void navigate({ to: '/reports', search: { period: p }, replace: true })}
            items={[
              { value: '4w', label: m["reports.period_4w"]() },
              { value: '3m', label: m["reports.period_3m"]() },
              { value: '12m', label: m["reports.period_12m"]() },
            ]}
          />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {figures.map((f) => (
          <Stat key={f.label} label={f.label} value={f.value} onClick={() => go(f.to)} />
        ))}
      </div>

      <Panel title={period === '12m' ? m["reports.month_by_month"]() : m["reports.week_by_week"]()} hint={m["reports.flow_hint"]()}>
        <div className="no-scrollbar overflow-x-auto">
          <div className="flex min-w-[32rem] items-end gap-2" style={{ height: '10rem' }}>
            {flow.map((b) => (
              <div key={b.start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <span title={`${m["reports.diary_entries"]()}: ${b.diary}`} className="w-3 rounded-t bg-primary" style={{ height: `${(b.diary / flowMax) * 100}%`, minHeight: b.diary ? 3 : 0 }} />
                  <span title={`${m["reports.cases_opened"]()}: ${b.cases}`} className="w-3 rounded-t bg-foreground/25" style={{ height: `${(b.cases / flowMax) * 100}%`, minHeight: b.cases ? 3 : 0 }} />
                </div>
                <span className={cn('text-xs whitespace-nowrap text-muted-foreground', period === '3m' && 'text-[0.625rem]')}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary" />
            {m["reports.diary_entries"]()}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-foreground/25" />
            {m["reports.cases_opened"]()}
          </span>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {also.length > 0 && (
          <Group title={m["reports.also"]()}>
            {also.map((row) => (
              <GroupRow
                key={row.label}
                label={row.label}
                value={<span className="font-medium text-foreground tabular-nums">{row.value}</span>}
                chevron
                onClick={() => go(row.to)}
              />
            ))}
          </Group>
        )}
        <Panel title={m["reports.top_offences"]()} hint={m["reports.top_offences_hint"]()}>
          {s.topOffences.length === 0 ? <EmptyNote>{m["reports.no_offences"]()}</EmptyNote> : s.topOffences.map((o) => <BarRow key={o.label} label={o.label} value={o.count} max={offenceMax} />)}
        </Panel>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="px-1">{m["reports.standing"]()}</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Standing title={m["nav.cases"]()} counts={s.caseStatusCounts} label={caseStatusLabel} to="/investigations?view=all" />
          <Standing title={m["reports.custody_records"]()} counts={s.custodyStatusCounts} label={custodyStatusLabel} to="/search/custody" />
          <Standing title={m["nav.bonds_and_sureties"]()} counts={s.bondStatusCounts} label={bondStatusLabel} to="/search/bonds" />
          <Standing title={m["nav.exhibits"]()} counts={s.exhibitStatusCounts} label={exhibitStatusLabel} to="/evidence" />
          <Standing title={m["nav.referrals"]()} counts={s.referralStatusCounts} label={referralStatusLabel} to="/referrals" />
          <Standing title={m["reports.referred_to"]()} counts={s.referralDestinationCounts} label={referralDestinationTypeLabel} to="/referrals" />
        </div>
      </section>
    </article>
  )
}
