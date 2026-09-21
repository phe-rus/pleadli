import { format } from 'date-fns/format'
import { useMemo } from 'react'
import { periodRange } from './period'
import { useReports } from './queries'
import type { ReportRecord } from './schema'

/** Where the last closed month's return stands, from nothing produced to
 * received by Head Office. `attested` is a finished return this facility has
 * nobody to send to; `ready_to_send` is one it can send and has not. */
export type ReturnStage = 'not_produced' | 'awaiting_attestation' | 'ready_to_send' | 'attested' | 'queued' | 'send_failed' | 'acknowledged'

/** A return counts as the month's if its period is within this of the month. */
const TOLERANCE_MS = 3 * 86_400_000

export function returnStageOf(report: ReportRecord | null, linked: boolean): ReturnStage {
  if (!report) return 'not_produced'
  if (report.attestedAt == null) return 'awaiting_attestation'
  if (report.submission === 'acknowledged') return 'acknowledged'
  if (report.submissionError) return 'send_failed'
  if (report.submission === 'queued') return 'queued'
  return linked ? 'ready_to_send' : 'attested'
}

/** The return produced for the month that has just closed: the attested one
 * when there is one, otherwise the latest. A correction is a new report, so
 * there can be several. */
export function returnFor(reports: readonly ReportRecord[], from: number, to: number): ReportRecord | null {
  const ofMonth = reports.filter(
    (r) => r.kind === 'monthly_return' && r.periodFrom != null && r.periodTo != null && r.periodFrom <= from + TOLERANCE_MS && r.periodTo >= to - TOLERANCE_MS,
  )
  const attested = ofMonth.filter((r) => r.attestedAt != null).sort((a, b) => (b.attestedAt ?? 0) - (a.attestedAt ?? 0))
  return attested[0] ?? ofMonth.sort((a, b) => b.generatedAt - a.generatedAt)[0] ?? null
}

/** The last closed month and its return, for whoever may read reports.
 * `report` is `undefined` while the list loads, so a caller can tell "not
 * produced" from "not known yet". */
export function useClosedMonthReturn(enabled: boolean, linked: boolean) {
  const { data: reports, isPending } = useReports(enabled)
  // Keyed on the calendar month so it is worked out once, and again when the month turns.
  const thisMonth = format(new Date(), 'yyyy-MM')
  const month = useMemo(() => periodRange('last_month', '', ''), [thisMonth])
  const report = useMemo(() => (reports && month ? returnFor(reports, month.from, month.to) : null), [reports, month])
  return { month, report, reports, stage: returnStageOf(report, linked), loading: enabled && isPending }
}
