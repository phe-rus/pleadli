import { ChartBlock } from '@/components/charts/chart-block'
import { HorizontalBars, type BarDatum, type BarTone } from '@/components/charts/horizontal-bars'
import { Sparkline } from '@/components/charts/sparkline'
import { VerticalBars } from '@/components/charts/vertical-bars'
import { custodyStatusLabel, prisonerStatusLabel } from '@/features/prisoners'
import { releaseTypeLabel } from '@/features/releases'
import { transferDirectionLabel } from '@/features/transfers'
import { healthEventTypeLabel } from '@/features/health-events'
import { reportsSummaryOptions, useReportsSummary, type ReportsSummary } from '@/features/reports'
import { Button } from '@pleadli/ui/button'
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

const profileSexLabel: Record<string, string> = { male: 'Male', female: 'Female' }
const profileEducationLabel: Record<string, string> = {
  none: 'None',
  primary: 'Primary',
  secondary: 'Secondary',
  tertiary: 'Tertiary',
  other: 'Other',
}
const profileNationalityLabel: Record<string, string> = { ugandan: 'Ugandan', foreign: 'Foreign' }

/** UPS-shaped export: the six population-profile dimensions as one
 * normalized Dimension / Label / Count CSV. UPS labels surface as-is (the
 * app's display labels), nulls as "Not recorded", the same buckets the
 * charts show. */
function populationProfileToCsv(summary: ReportsSummary): string {
  const blocks: Array<[string, typeof summary.prisonerSexCounts, (raw: string) => string]> = [
    ['Age group', summary.prisonerAgeGroupCounts, (raw) => raw],
    ['Sex', summary.prisonerSexCounts, (raw) => profileSexLabel[raw] ?? raw],
    ['Education level', summary.prisonerEducationCounts, (raw) => profileEducationLabel[raw] ?? raw],
    ['Nationality', summary.prisonerNationalityCounts, (raw) => profileNationalityLabel[raw] ?? raw],
    ['Capital-offence type', summary.prisonerOffenceTypeCounts, (raw) => raw],
    ['Sentence category', summary.prisonerSentenceCategoryCounts, (raw) => raw],
  ]
  const lines = ['Dimension,Label,Count']
  for (const [dimension, counts, labelFn] of blocks) {
    for (const { label, count } of counts) {
      const value = labelFn(label)
      lines.push(
        [dimension, value, String(count)]
          .map((cell) => `"${cell.replace(/"/g, '""')}"`)
          .join(','),
      )
    }
  }
  return lines.join('\n')
}

function downloadCsv(filename: string, text: string) {
  const blob = new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
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
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Reports</h1>
          <p className="md:max-w-lg">
            How this prison is doing over time. Overview answers what needs attention right now; this answers the trend.
          </p>
        </div>
      </header>

      <section className="page-section grid grid-cols-1 gap-6 md:grid-cols-2">
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

      <section className="page-section flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Admissions over time</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ChartBlock title="Admissions by year" description="Prisoners admitted per calendar year.">
            <VerticalBars
              rows={summary.admissionYearCounts.map((c) => ({ label: c.label, value: c.count }))}
              max={Math.max(...summary.admissionYearCounts.map((c) => c.count), 1)}
            />
          </ChartBlock>
          <ChartBlock title="Admissions by month" description="Prisoners admitted per calendar month.">
            <VerticalBars
              rows={summary.admissionMonthCounts.map((c) => ({
                label: format(new Date(`${c.label}-01`), 'MMM yy'),
                value: c.count,
              }))}
              max={Math.max(...summary.admissionMonthCounts.map((c) => c.count), 1)}
            />
          </ChartBlock>
        </div>
      </section>

      <section className="page-section flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Population profile</h2>
          <div className="print:hidden flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => downloadCsv('population-profile.csv', populationProfileToCsv(summary))}>
              Export CSV
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Print / PDF
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Current prisoner population profiled the way UPS publishes national statistics (RESEARCH.md §8). Records entered
          from the admission form; "Not recorded" counts admissions captured before those fields existed.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title="By age group"
            description="All prisoner records, age band at present day."
            counts={summary.prisonerAgeGroupCounts}
          />
          <BreakdownBlock
            title="By sex"
            description="All prisoner records, recorded sex."
            counts={summary.prisonerSexCounts}
            labelFn={(raw) => profileSexLabel[raw] ?? raw}
          />
          <BreakdownBlock
            title="By education level"
            description="All prisoner records, recorded education level."
            counts={summary.prisonerEducationCounts}
            labelFn={(raw) => profileEducationLabel[raw] ?? raw}
          />
          <BreakdownBlock
            title="By nationality"
            description="All prisoner records, Ugandan or foreign."
            counts={summary.prisonerNationalityCounts}
            labelFn={(raw) => profileNationalityLabel[raw] ?? raw}
          />
          <BreakdownBlock
            title="By capital-offence type"
            description="Free-text offence grouped by capital-offence keyword at chart time; heuristic."
            counts={summary.prisonerOffenceTypeCounts}
          />
          <BreakdownBlock
            title="By sentence category"
            description="Convicted (Sentenced), unconvicted (Remand), or civil."
            counts={summary.prisonerSentenceCategoryCounts}
          />
        </div>
      </section>

      <section className="page-section flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Also tracked</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniTrend title="Releases" timestamps={summary.releaseTimestamps} />
          <MiniTrend title="Transfers" timestamps={summary.transferTimestamps} />
          <MiniTrend title="Visits" timestamps={summary.visitTimestamps} />
          <MiniTrend title="Health events" timestamps={summary.healthEventTimestamps} />
        </div>
      </section>

      <section className="page-section flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">By facility reach</h2>
        <p className="text-xs text-muted-foreground">
          Snapshot-derived (spec docs/specs/prisons/0001-head-office-peer-sync-network/0003-sync-protocol-and-head-office-
          management.md): on Head Office every synced facility's prisoners are stamped with it; records that predate pairing
          show as "Not assigned".
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title="Prisoner population by facility"
            description="All prisoner records held, attributed to the facility that sent them."
            counts={summary.facilityPopulationCounts}
          />
          <BreakdownBlock
            title="In custody by facility"
            description="Prisoners currently in custody, attributed to the facility that sent them."
            counts={summary.facilityInCustodyCounts}
          />
        </div>
      </section>

      <section className="page-section flex flex-col gap-3">
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
