import * as m from '@/paraglide/messages'
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
import { format } from '@/lib/date'
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
      <span className="text-[0.625rem] text-muted-foreground">{m["reports.this_week"]({ weeks: WEEKS })}</span>
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
        <p className="text-xs text-muted-foreground">{m["common.nothing_recorded"]()}</p>
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
    <article className="page">
      <section className="flex flex-col">
        <h1>{m["reports.title"]()}</h1>
        <p className="md:max-w-lg">
          {m["reports.lead"]()}
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <WeeklyTrend
          title={m["reports.diary"]()}
          description={m["reports.diary_desc"]({ weeks: WEEKS })}
          timestamps={summary.stationDiaryTimestamps}
        />
        <WeeklyTrend
          title={m["reports.intake"]()}
          description={m["reports.intake_desc"]({ weeks: WEEKS })}
          timestamps={summary.caseTimestamps}
        />
        <WeeklyTrend
          title={m["common.custody"]()}
          description={m["reports.custody_desc"]({ weeks: WEEKS })}
          timestamps={summary.custodyTimestamps}
        />
        <WeeklyTrend
          title={m["nav.statements"]()}
          description={m["reports.statements_desc"]({ weeks: WEEKS })}
          timestamps={summary.statementTimestamps}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{m["reports.also"]()}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MiniTrend title={m["nav.incidents"]()} timestamps={summary.incidentTimestamps} />
          <MiniTrend title={m["reports.bonds_granted"]()} timestamps={summary.bondTimestamps} />
          <MiniTrend title={m["reports.evidence_recovered"]()} timestamps={summary.exhibitTimestamps} />
          <MiniTrend title={m["investigation.charge_sheets"]()} timestamps={summary.chargeSheetTimestamps} />
          <MiniTrend title={m["common.referrals"]()} timestamps={summary.referralTimestamps} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{m["reports.breakdown"]()}</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title={m["reports.cases_status"]()}
            description={m["reports.cases_status_desc"]()}
            counts={summary.caseStatusCounts}
            labelFn={caseStatusLabel}
            toneFn={caseTone}
          />
          <BreakdownBlock
            title={m["reports.custody_status"]()}
            description={m["reports.custody_status_desc"]()}
            counts={summary.custodyStatusCounts}
            labelFn={custodyStatusLabel}
            toneFn={custodyTone}
          />
          <BreakdownBlock
            title={m["reports.bonds_status"]()}
            description={m["reports.bonds_status_desc"]()}
            counts={summary.bondStatusCounts}
            labelFn={bondStatusLabel}
            toneFn={bondTone}
          />
          <BreakdownBlock
            title={m["reports.evidence_status"]()}
            description={m["reports.evidence_status_desc"]()}
            counts={summary.exhibitStatusCounts}
            labelFn={exhibitStatusLabel}
          />
          <BreakdownBlock
            title={m["reports.referrals_status"]()}
            description={m["reports.referrals_status_desc"]()}
            counts={summary.referralStatusCounts}
            labelFn={referralStatusLabel}
            toneFn={referralStatusTone}
          />
          <BreakdownBlock
            title={m["reports.referrals_dest"]()}
            description={m["reports.referrals_dest_desc"]()}
            counts={summary.referralDestinationCounts}
            labelFn={referralDestinationTypeLabel}
          />
          <BreakdownBlock
            title={m["reports.top_offences"]()}
            description={m["reports.top_offences_desc"]()}
            counts={summary.topOffences}
          />
        </div>
      </section>
    </article>
  )
}
