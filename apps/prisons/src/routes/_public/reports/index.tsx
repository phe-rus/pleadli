import { ChartBlock } from '@/components/charts/chart-block'
import { HorizontalBars, type BarDatum, type BarTone } from '@/components/charts/horizontal-bars'
import { Sparkline } from '@/components/charts/sparkline'
import { VerticalBars } from '@/components/charts/vertical-bars'
import { custodyStatusLabel, prisonerStatusLabel } from '@/features/prisoners'
import { releaseTypeLabel } from '@/features/releases'
import { transferDirectionLabel } from '@/features/transfers'
import { healthEventTypeLabel } from '@/features/health-events'
import { reportsSummaryOptions, useReportsSummary } from '@/features/reports'
import { weekBucketStarts, weeklyBuckets } from '@/lib/weekly-buckets'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/reports/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...reportsSummaryOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

const WEEKS = 8

function toRows(counts: { label: string; count: number }[], labelFn?: (label: string) => string, toneFn?: (rawLabel: string) => BarTone): BarDatum[] {
  return counts.map((c) => ({ label: labelFn ? labelFn(c.label) : c.label, value: c.count, tone: toneFn?.(c.label) }))
}

function custodyTone(status: string): BarTone {
  if (status === 'in_custody') return 'warning'
  if (status === 'transferred_out') return 'default'
  return 'success'
}

function MiniTrend({ title, timestamps }: { title: string; timestamps: number[] }) {
  const buckets = useMemo(() => weeklyBuckets(timestamps, WEEKS), [timestamps])
  const thisWeek = buckets[buckets.length - 1]
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className="text-lg font-semibold tabular-nums">{thisWeek}</span>
      </div>
      <Sparkline data={buckets} />
      <span className="text-[0.625rem] text-muted-foreground">this week, of {WEEKS} weeks shown</span>
    </div>
  )
}

function WeeklyTrend({ title, description, timestamps }: { title: string; description: string; timestamps: number[] }) {
  const buckets = useMemo(() => weeklyBuckets(timestamps, WEEKS), [timestamps])
  const labels = useMemo(() => weekBucketStarts(WEEKS).map((ts) => format(ts, 'MMM d')), [])
  const rows: BarDatum[] = buckets.map((value, i) => ({ label: labels[i], value }))
  const max = Math.max(...buckets, 1)

  return (
    <ChartBlock title={title} description={description}>
      <VerticalBars rows={rows} max={max} />
    </ChartBlock>
  )
}

function BreakdownBlock({
  title,
  description,
  counts,
  labelFn,
  toneFn,
}: {
  title: string
  description: string
  counts: { label: string; count: number }[]
  labelFn?: (label: string) => string
  toneFn?: (rawLabel: string) => BarTone
}) {
  const rows = toRows(counts, labelFn, toneFn)
  const max = Math.max(...rows.map((r) => r.value), 1)
  if (rows.length === 0) {
    return (
      <ChartBlock title={title} description={description}>
        <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
      </ChartBlock>
    )
  }
  return (
    <ChartBlock title={title} description={description}>
      <HorizontalBars rows={rows} max={max} />
    </ChartBlock>
  )
}

/**
 * How this prison is doing over time — derived entirely from existing
 * records, nothing tracked separately. Deliberately does NOT show escape
 * rate or mortality rate: UPS's own real published statistics track these
 * (docs/prisons/RESEARCH.md §8), but this app has no escape/death domain
 * yet, so faking those numbers here would be exactly the invented metric
 * the product model rules out.
 */
function RouteComponent() {
  const { data: summary } = useReportsSummary()

  return (
    <article className="container flex flex-col gap-8 pt-5 pb-20">
      <section className="flex flex-col">
        <h1>Reports</h1>
        <p className="md:max-w-lg">
          How this prison is doing over time. Overview answers what needs attention right now; this answers the trend.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <WeeklyTrend
          title="Admissions"
          description={`Prisoners admitted per week, last ${WEEKS} weeks.`}
          timestamps={summary.admissionTimestamps}
        />
        <WeeklyTrend
          title="Court productions"
          description={`Court productions recorded per week, last ${WEEKS} weeks.`}
          timestamps={summary.courtProductionTimestamps}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Also tracked</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniTrend title="Releases" timestamps={summary.releaseTimestamps} />
          <MiniTrend title="Transfers" timestamps={summary.transferTimestamps} />
          <MiniTrend title="Visits" timestamps={summary.visitTimestamps} />
          <MiniTrend title="Health events" timestamps={summary.healthEventTimestamps} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Current breakdown</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title="Prisoners by category"
            description="All prisoner records, current category."
            counts={summary.prisonerCategoryCounts}
            labelFn={prisonerStatusLabel}
          />
          <BreakdownBlock
            title="Prisoners by custody status"
            description="All prisoner records, current custody status."
            counts={summary.custodyStatusCounts}
            labelFn={custodyStatusLabel}
            toneFn={custodyTone}
          />
          <BreakdownBlock
            title="Releases by type"
            description="Every release event recorded, by type."
            counts={summary.releaseTypeCounts}
            labelFn={releaseTypeLabel}
          />
          <BreakdownBlock
            title="Transfers by direction"
            description="Every transfer event recorded, by direction."
            counts={summary.transferDirectionCounts}
            labelFn={transferDirectionLabel}
          />
          <BreakdownBlock
            title="Health events by type"
            description="Every health event recorded, by type."
            counts={summary.healthEventTypeCounts}
            labelFn={healthEventTypeLabel}
          />
        </div>
      </section>
    </article>
  )
}
