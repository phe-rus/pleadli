import { Row, RowList } from '@/components/operational-row'
import { useHqConfig, usePermissions } from '@/features/session'
import { ApiError } from '@/lib/api'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { m } from '@/paraglide/messages'
import { newTextBlock, registerDraft } from './blocks'
import { previewReport } from './data'
import { periodPresets, periodRange, periodText, type PeriodPreset } from './period'
import { useCreateDraft, useGenerateReport } from './queries'
import { catalogEntry, reportCatalog } from './report-catalog'
import type { ReportKind } from './schema'

/**
 * Where a report starts. A blank one is written from nothing; a register
 * gives a document with its table already filled for the period, to be cut
 * down and added to; the monthly return is the one fixed form, built by the
 * node in the shape it is submitted and attested, not composed.
 */
export function NewReportPage() {
  const { data: hqConfig } = useHqConfig()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const create = useCreateDraft()
  const generate = useGenerateReport()
  const headOffice = hqConfig?.isHeadOffice ?? false
  const canWrite = can('report.generate')

  const [preset, setPreset] = useState<PeriodPreset>('last_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const range = useMemo(() => periodRange(preset, customFrom, customTo), [preset, customFrom, customTo])

  const entries = reportCatalog.filter((entry) => entry.headOffice === headOffice)
  const registers = entries.filter((entry) => entry.kind !== 'monthly_return')
  const monthly = entries.find((entry) => entry.kind === 'monthly_return')
  const needsPeriod = entries.some((entry) => entry.takesPeriod)

  const fail = (title: string) => (error: unknown) => t.error(title, { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() })
  const open = (id: string) => void navigate({ to: '/reports/$report', params: { report: id } })

  const startBlank = () =>
    create.mutate({ title: m.reports_untitled(), blocks: [newTextBlock()] }, { onSuccess: (draft) => open(draft.id), onError: fail(m.reports_could_not_start()) })

  const compose = async (kind: ReportKind, takesPeriod: boolean) => {
    setBusy(kind)
    try {
      const document = await previewReport(kind, takesPeriod ? (range?.from ?? null) : null, takesPeriod ? (range?.to ?? null) : null)
      const title = catalogEntry(kind)?.title() ?? document.title
      const blocks = registerDraft(kind, title, document)
      if (!blocks) throw new Error(m.reports_this_report_could_not_be_read())
      create.mutate({ title, blocks }, { onSuccess: (draft) => open(draft.id), onError: fail(m.reports_could_not_start()) })
    } catch (error) {
      fail(m.reports_could_not_start())(error)
    } finally {
      setBusy(null)
    }
  }

  const produceReturn = () =>
    range && generate.mutate({ kind: 'monthly_return', from: range.from, to: range.to }, { onSuccess: (report) => open(report.id), onError: fail(m.reports_could_not_produce()) })

  return (
    <article className="page [--page-max:64rem]">
      <header className="page-header">
        <div>
          <h1>{m.reports_new_heading()}</h1>
          <p>{m.reports_new_about()}</p>
        </div>
      </header>

      {!canWrite && <p>{m.reports_you_may_read_but_not_produce()}</p>}

      {needsPeriod && (
        <section className="page-section">
          <div className="section-head">
            <h2>{m.reports_period()}</h2>
            <p>{range ? periodText(range.from, range.to) : m.reports_choose_the_days()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {periodPresets.map((option) => (
              <Button key={option.id} size="sm" variant={preset === option.id ? 'default' : 'secondary'} aria-pressed={preset === option.id} onClick={() => setPreset(option.id)}>
                {option.label()}
              </Button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} aria-label={m.reports_from()} className="w-40" />
              <p>{m.reports_to()}</p>
              <Input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} aria-label={m.reports_to()} className="w-40" />
            </div>
          )}
        </section>
      )}

      <section className="page-section">
        <div className="section-head">
          <h2>{m.reports_start_from()}</h2>
        </div>
        <RowList>
          <Row
            title={m.reports_blank()}
            summary={m.reports_blank_about()}
            trailing={
              <Button size="sm" disabled={!canWrite || create.isPending} onClick={startBlank}>
                {m.reports_start()}
              </Button>
            }
          />
          {registers.map((entry) => (
            <Row
              key={entry.kind}
              title={entry.title()}
              summary={entry.about()}
              trailing={
                <Button size="sm" disabled={!canWrite || busy !== null || create.isPending || (entry.takesPeriod && !range)} onClick={() => void compose(entry.kind, entry.takesPeriod)}>
                  {busy === entry.kind ? m.reports_loading() : m.reports_compose()}
                </Button>
              }
            />
          ))}
          {monthly && (
            <Row
              title={monthly.title()}
              summary={m.reports_monthly_fixed()}
              trailing={
                <Button size="sm" variant="secondary" disabled={!canWrite || !range || generate.isPending} onClick={produceReturn}>
                  {generate.isPending ? m.reports_producing() : m.reports_produce()}
                </Button>
              }
            />
          )}
        </RowList>
      </section>
    </article>
  )
}
