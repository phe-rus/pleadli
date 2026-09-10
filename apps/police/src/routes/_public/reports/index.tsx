import { ChartBlock } from '@/components/charts/chart-block'
import { HorizontalBars, type BarDatum, type BarTone } from '@/components/charts/horizontal-bars'
import { Sparkline } from '@/components/charts/sparkline'
import { VerticalBars } from '@/components/charts/vertical-bars'
import { bondStatusLabel } from '@/features/bonds/schema'
import { caseStatuses } from '@/features/cases/schema'
import { custodyStatusLabel } from '@/features/custody/schema'
import { exhibitStatusLabel } from '@/features/evidence/schema'
import { referralDestinationTypeLabel, referralStatusLabel } from '@/features/referrals/schema'
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

function caseStatusLabel(status: string) {
  return caseStatuses.find((s) => s.value === status)?.label ?? status
}

function toRows(
  counts: { label: string; count: number }[],
  labelFn?: (label: string) => string,
  toneFn?: (rawLabel: string) => BarTone,
): BarDatum[] {
  return counts.map((c) => ({
    label: labelFn ? labelFn(c.label) : c.label,
    value: c.count,
    tone: toneFn?.(c.label),
  }))
}

function caseTone(status: string): BarTone {
  return status === 'closed' ? 'success' : 'default'
}
function custodyTone(status: string): BarTone {
  return status === 'in_custody' ? 'warning' : 'success'
}
function bondTone(status: string): BarTone {
  if (status === 'forfeited') return 'critical'
  if (status === 'discharged') return 'success'
  return 'default'
}
function referralStatusTone(status: string): BarTone {
  if (status === 'rejected') return 'critical'
  if (status === 'accepted') return 'success'
  return 'warning'
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

function RouteComponent() {
  const { data: summary } = useReportsSummary()

  return (
    <article className="container flex flex-col gap-8 pt-5 pb-20">
      <section className="flex flex-col">
        <h1>Reports &amp; Analytics</h1>
        <p className="md:max-w-lg">
          How the station is doing over time. Derived entirely from existing records, nothing tracked
          separately. Overview answers what needs attention right now; this answers the trend.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <WeeklyTrend
          title="Station Diary activity"
          description={`Entries logged per week, last ${WEEKS} weeks.`}
          timestamps={summary.stationDiaryTimestamps}
        />
        <WeeklyTrend
          title="Case intake"
          description={`Cases opened per week, last ${WEEKS} weeks.`}
          timestamps={summary.caseTimestamps}
        />
        <WeeklyTrend
          title="Custody"
          description={`Arrests logged per week, last ${WEEKS} weeks.`}
          timestamps={summary.custodyTimestamps}
        />
        <WeeklyTrend
          title="Statements"
          description={`Statements taken per week, last ${WEEKS} weeks.`}
          timestamps={summary.statementTimestamps}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Also tracked</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MiniTrend title="Incidents" timestamps={summary.incidentTimestamps} />
          <MiniTrend title="Bonds granted" timestamps={summary.bondTimestamps} />
          <MiniTrend title="Evidence recovered" timestamps={summary.exhibitTimestamps} />
          <MiniTrend title="Charge sheets" timestamps={summary.chargeSheetTimestamps} />
          <MiniTrend title="Referrals" timestamps={summary.referralTimestamps} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Current breakdown</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title="Cases by status"
            description="All cases, current status."
            counts={summary.caseStatusCounts}
            labelFn={caseStatusLabel}
            toneFn={caseTone}
          />
          <BreakdownBlock
            title="Custody by status"
            description="All custody records, current status."
            counts={summary.custodyStatusCounts}
            labelFn={custodyStatusLabel}
            toneFn={custodyTone}
          />
          <BreakdownBlock
            title="Bonds by status"
            description="All bonds granted, current status."
            counts={summary.bondStatusCounts}
            labelFn={bondStatusLabel}
            toneFn={bondTone}
          />
          <BreakdownBlock
            title="Evidence by status"
            description="All exhibits logged, current status."
            counts={summary.exhibitStatusCounts}
            labelFn={exhibitStatusLabel}
          />
          <BreakdownBlock
            title="Referrals by status"
            description="All referrals, current outcome."
            counts={summary.referralStatusCounts}
            labelFn={referralStatusLabel}
            toneFn={referralStatusTone}
          />
          <BreakdownBlock
            title="Referrals by destination"
            description="Where cases have been referred."
            counts={summary.referralDestinationCounts}
            labelFn={referralDestinationTypeLabel}
          />
          <BreakdownBlock
            title="Top offences charged"
            description="Most common offences on charge sheets."
            counts={summary.topOffences}
          />
        </div>
      </section>
    </article>
  )
}
