import { ChartBlock } from '@/components/charts/chart-block'
import { HorizontalBars, type BarDatum, type BarTone } from '@/components/charts/horizontal-bars'
import { Sparkline } from '@/components/charts/sparkline'
import { VerticalBars } from '@/components/charts/vertical-bars'
import { custodyStatusLabel, prisonerStatusLabel } from '@/features/prisoners'
import { releaseTypeLabel } from '@/features/releases'
import { transferDirectionLabel } from '@/features/transfers'
import { healthEventTypeLabel } from '@/features/health-events'
import { useQuery } from '@tanstack/react-query'
import { reportsSummaryOptions } from './queries'
import type { ReportsSummary } from './schema'
import { Button } from '@pleadli/ui/button'
import { weekBucketStarts, weeklyBuckets } from '@/lib/weekly-buckets'
import { format } from 'date-fns/format'
import { useMemo } from 'react'
import { m } from '@/paraglide/messages'

const WEEKS = 8

function toRows(counts: { label: string; count: number }[], labelFn?: (label: string) => string, toneFn?: (rawLabel: string) => BarTone): BarDatum[] {
  return counts.map((c) => ({ label: labelFn ? labelFn(c.label) : c.label, value: c.count, tone: toneFn?.(c.label) }))
}

function custodyTone(status: string): BarTone {
  if (status === 'in_custody') return 'warning'
  if (status === 'transferred_out') return 'default'
  return 'success'
}

const profileSexLabel: Record<string, string> = { get male() { return m.route_reports_male() }, get female() { return m.route_reports_female() } }
export const profileEducationLabel: Record<string, string> = {
  get none() { return m.route_reports_none() },
  get primary() { return m.route_reports_primary() },
  get secondary() { return m.route_reports_secondary() },
  get tertiary() { return m.route_reports_tertiary() },
  get other() { return m.route_reports_other() },
}
export const profileNationalityLabel: Record<string, string> = { get ugandan() { return m.route_reports_ugandan() }, get foreign() { return m.route_reports_foreign() } }

/** UPS-shaped export: the six population-profile dimensions as one
 * normalized Dimension / Label / Count CSV. UPS labels surface as-is (the
 * app's display labels), nulls as "Not recorded", the same buckets the
 * charts show. */
function populationProfileToCsv(summary: ReportsSummary): string {
  const blocks: Array<[string, typeof summary.prisonerSexCounts, (raw: string) => string]> = [
    [m.route_reports_age_group(), summary.prisonerAgeGroupCounts, (raw) => raw],
    [m.route_reports_sex(), summary.prisonerSexCounts, (raw) => profileSexLabel[raw] ?? raw],
    [m.route_reports_education_level(), summary.prisonerEducationCounts, (raw) => profileEducationLabel[raw] ?? raw],
    [m.route_reports_nationality(), summary.prisonerNationalityCounts, (raw) => profileNationalityLabel[raw] ?? raw],
    [m.route_reports_capital_offence_type(), summary.prisonerOffenceTypeCounts, (raw) => raw],
    [m.route_reports_sentence_category(), summary.prisonerSentenceCategoryCounts, (raw) => raw],
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
      <span className="text-[0.625rem] text-muted-foreground">{m.route_reports_this_week_of_weeks_shown({ WEEKS })}</span>
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
        <p>{m.route_reports_nothing_recorded_yet()}</p>
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
 * How the estate or the prison is doing over time, drawn entirely from records
 * already kept: nothing here is tracked separately, so it can never show a
 * figure the registers do not hold. It lives on the daily screen (Today for a
 * facility, Overview for Head Office) because it is something to glance at.
 * The printable, numbered returns are in Reports.
 *
 * Deliberately no escape or mortality rate: this app has no such records, and
 * inventing them would be exactly the made-up metric the product model rules out.
 */
export function StatisticsBoard({ scope }: { scope: 'facility' | 'head_office' }) {
  const { data: summary } = useQuery(reportsSummaryOptions())
  if (!summary) return null

  return (
    <>
      {scope === 'head_office' && (
      <section className="page-section flex flex-col gap-3">
        <h2>{m.route_reports_by_facility_reach()}</h2>
        <p>
          {m.route_reports_snapshot_derived_spec_docs_specs_prisons()}
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title={m.route_reports_prisoner_population_by_facility()}
            description={m.route_reports_all_prisoner_records_held_attributed_to()}
            counts={summary.facilityPopulationCounts}
          />
          <BreakdownBlock
            title={m.route_reports_in_custody_by_facility()}
            description={m.route_reports_prisoners_currently_in_custody_attribute()}
            counts={summary.facilityInCustodyCounts}
          />
        </div>
      </section>

      )}
      <section className="page-section grid grid-cols-1 gap-6 md:grid-cols-2">
        <WeeklyTrend
          title={m.route_reports_admissions()}
          description={m.route_reports_prisoners_admitted_per_week_last_weeks({ WEEKS })}
          timestamps={summary.admissionTimestamps}
        />
        <WeeklyTrend
          title={m.route_reports_court_productions()}
          description={m.route_reports_court_productions_recorded_per_week_last({ WEEKS })}
          timestamps={summary.courtProductionTimestamps}
        />
      </section>

      <section className="page-section flex flex-col gap-3">
        <h2>{m.route_reports_admissions_over_time()}</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ChartBlock title={m.route_reports_admissions_by_year()} description={m.route_reports_prisoners_admitted_per_calendar_year()}>
            <VerticalBars
              rows={summary.admissionYearCounts.map((c) => ({ label: c.label, value: c.count }))}
              max={Math.max(...summary.admissionYearCounts.map((c) => c.count), 1)}
            />
          </ChartBlock>
          <ChartBlock title={m.route_reports_admissions_by_month()} description={m.route_reports_prisoners_admitted_per_calendar_month()}>
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
          <h2>{m.route_reports_population_profile()}</h2>
          <div className="print:hidden flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => downloadCsv('population-profile.csv', populationProfileToCsv(summary))}>
              {m.route_reports_export_csv()}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              {m.route_reports_print_pdf()}
            </Button>
          </div>
        </div>
        <p>
          {m.route_reports_current_prisoner_population_profiled_the()}
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title={m.route_reports_by_age_group()}
            description={m.route_reports_all_prisoner_records_age_band_at()}
            counts={summary.prisonerAgeGroupCounts}
          />
          <BreakdownBlock
            title={m.route_reports_by_sex()}
            description={m.route_reports_all_prisoner_records_recorded_sex()}
            counts={summary.prisonerSexCounts}
            labelFn={(raw) => profileSexLabel[raw] ?? raw}
          />
          <BreakdownBlock
            title={m.route_reports_by_education_level()}
            description={m.route_reports_all_prisoner_records_recorded_education()}
            counts={summary.prisonerEducationCounts}
            labelFn={(raw) => profileEducationLabel[raw] ?? raw}
          />
          <BreakdownBlock
            title={m.route_reports_by_nationality()}
            description={m.route_reports_all_prisoner_records_ugandan_or_foreign()}
            counts={summary.prisonerNationalityCounts}
            labelFn={(raw) => profileNationalityLabel[raw] ?? raw}
          />
          <BreakdownBlock
            title={m.route_reports_by_capital_offence_type()}
            description={m.route_reports_free_text_offence_grouped_by_capital()}
            counts={summary.prisonerOffenceTypeCounts}
          />
          <BreakdownBlock
            title={m.route_reports_by_sentence_category()}
            description={m.route_reports_convicted_sentenced_unconvicted_remand_o()}
            counts={summary.prisonerSentenceCategoryCounts}
          />
        </div>
      </section>

      <section className="page-section flex flex-col gap-3">
        <h2>{m.route_reports_also_tracked()}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniTrend title={m.route_reports_releases()} timestamps={summary.releaseTimestamps} />
          <MiniTrend title={m.route_reports_transfers()} timestamps={summary.transferTimestamps} />
          <MiniTrend title={m.route_reports_visits()} timestamps={summary.visitTimestamps} />
          <MiniTrend title={m.route_reports_health_events()} timestamps={summary.healthEventTimestamps} />
        </div>
      </section>

      <section className="page-section flex flex-col gap-3">
        <h2>{m.route_reports_current_breakdown()}</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <BreakdownBlock
            title={m.route_reports_prisoners_by_category()}
            description={m.route_reports_all_prisoner_records_current_category()}
            counts={summary.prisonerCategoryCounts}
            labelFn={prisonerStatusLabel}
          />
          <BreakdownBlock
            title={m.route_reports_prisoners_by_custody_status()}
            description={m.route_reports_all_prisoner_records_current_custody_sta()}
            counts={summary.custodyStatusCounts}
            labelFn={custodyStatusLabel}
            toneFn={custodyTone}
          />
          <BreakdownBlock
            title={m.route_reports_releases_by_type()}
            description={m.route_reports_every_release_event_recorded_by_type()}
            counts={summary.releaseTypeCounts}
            labelFn={releaseTypeLabel}
          />
          <BreakdownBlock
            title={m.route_reports_transfers_by_direction()}
            description={m.route_reports_every_transfer_event_recorded_by_directi()}
            counts={summary.transferDirectionCounts}
            labelFn={transferDirectionLabel}
          />
          <BreakdownBlock
            title={m.route_reports_health_events_by_type()}
            description={m.route_reports_every_health_event_recorded_by_type()}
            counts={summary.healthEventTypeCounts}
            labelFn={healthEventTypeLabel}
          />
        </div>
      </section>
    </>
  )
}
