import { catalogEntry, reportCatalog } from './report-catalog'
import { periodPresets, periodRange, periodText, type PeriodPreset } from './period'
import { useGenerateReport, useReceivedReturns, useReports } from './queries'
import { type ReportKind, type ReportRecord } from './schema'
import { useHqConfig, usePermissions } from '@/features/session'
import { ApiError } from '@/lib/api'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pleadli/ui/table'
import { Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import { m } from '@/paraglide/messages'

/**
 * The returns and registers this installation produces, as numbered documents
 * to print. Statistics, the trends and breakdowns, are on Today (a facility)
 * and Overview (Head Office): this page is for what is handed to someone else.
 * Producing one stores it with a reference and a fingerprint of its figures,
 * so the same numbers can be opened, and a printed copy checked, later.
 */
export function ReportsPage() {
  const { data: hqConfig } = useHqConfig()
  const { can } = usePermissions()
  const navigate = useNavigate()
  const generate = useGenerateReport()
  const { data: history } = useReports()
  const headOffice = hqConfig?.isHeadOffice ?? false
  const canGenerate = can('report.generate')
  const { data: received } = useReceivedReturns(headOffice && can('hq.reports'))

  const [preset, setPreset] = useState<PeriodPreset>('last_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo(() => periodRange(preset, customFrom, customTo), [preset, customFrom, customTo])

  const available = reportCatalog.filter((entry) => entry.headOffice === headOffice)
  const needsPeriod = available.some((entry) => entry.takesPeriod)

  const produce = (kind: ReportKind, takesPeriod: boolean) => {
    generate.mutate(takesPeriod && range ? { kind, from: range.from, to: range.to } : { kind }, {
      onSuccess: (report) => void navigate({ to: '/reports/$id', params: { id: report.id } }),
      onError: (error) => t.error(m.reports_could_not_produce(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() }),
    })
  }

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_reports_reports()}</h1>
          <p className="md:max-w-lg">{m.reports_page_about()}</p>
        </div>
      </header>

      {needsPeriod && (
        <section className="page-section">
          <div className="section-head">
            <h2>{m.reports_period()}</h2>
            <span className="text-sm text-muted-foreground">{range ? periodText(range.from, range.to) : m.reports_choose_the_days()}</span>
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
              <span className="text-sm text-muted-foreground">{m.reports_to()}</span>
              <Input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} aria-label={m.reports_to()} className="w-40" />
            </div>
          )}
        </section>
      )}

      <section className="page-section">
        <div className="section-head">
          <h2>{m.reports_produce_a_return()}</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {available.map((entry) => {
            const blocked = entry.takesPeriod && !range
            const busy = generate.isPending && generate.variables?.kind === entry.kind
            return (
              <Card key={entry.kind} className="p-0">
                <CardContent className="flex h-full flex-col justify-between gap-3 py-4">
                  <div className="flex flex-col gap-1">
                    <h3>{entry.title()}</h3>
                    <p>{entry.about()}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{entry.takesPeriod ? (range ? periodText(range.from, range.to) : m.reports_choose_the_days()) : m.reports_as_at_generation()}</span>
                    <Button size="sm" disabled={!canGenerate || blocked || generate.isPending} onClick={() => produce(entry.kind, entry.takesPeriod)}>
                      {busy ? m.reports_producing() : m.reports_produce()}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
        {!canGenerate && <p>{m.reports_you_may_read_but_not_produce()}</p>}
      </section>

      <section className="page-section">
        <div className="section-head">
          <h2>{m.reports_produced_so_far()}</h2>
        </div>
        {!history || history.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-10 text-center">
            <p>{m.reports_none_produced_yet()}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{m.reports_reference()}</TableHead>
                <TableHead>{m.reports_report()}</TableHead>
                <TableHead>{m.reports_period()}</TableHead>
                <TableHead>{m.reports_produced_by()}</TableHead>
                <TableHead>{m.returns_status()}</TableHead>
                <TableHead className="text-right">{m.reports_produced()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <Link to="/reports/$id" params={{ id: report.id }}>
                      <Badge variant="secondary" className="font-mono">
                        {report.reference}
                      </Badge>
                    </Link>
                  </TableCell>
                  <TableCell>{catalogEntry(report.kind)?.title() ?? report.title}</TableCell>
                  <TableCell>{periodText(report.periodFrom, report.periodTo)}</TableCell>
                  <TableCell>{report.generatedByName}</TableCell>
                  <TableCell>{returnStatus(report)}</TableCell>
                  <TableCell className="text-right tabular-nums">{format(report.generatedAt, 'd MMM yyyy, HH:mm')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {headOffice && (
        <section className="page-section">
          <div className="section-head">
            <h2>{m.returns_received_heading()}</h2>
          </div>
          <p className="md:max-w-lg">{m.returns_received_about()}</p>
          {!received || received.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center">
              <p>{m.returns_none_received()}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{m.returns_facility()}</TableHead>
                  <TableHead>{m.reports_reference()}</TableHead>
                  <TableHead>{m.reports_period()}</TableHead>
                  <TableHead>{m.returns_attested_by_column()}</TableHead>
                  <TableHead className="text-right">{m.returns_received_column()}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {received.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.facilityName}</TableCell>
                    <TableCell>
                      <Link to="/reports/$id" params={{ id: row.id }}>
                        <Badge variant="secondary" className="font-mono">
                          {row.reference}
                        </Badge>
                      </Link>{' '}
                      {row.superseded && <Badge variant="outline">{m.returns_replaced()}</Badge>}
                    </TableCell>
                    <TableCell>{periodText(row.periodFrom, row.periodTo)}</TableCell>
                    <TableCell>{row.attestedByName}</TableCell>
                    <TableCell className="text-right tabular-nums">{format(row.receivedAt, 'd MMM yyyy, HH:mm')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </article>
  )
}

/** Only a monthly return goes through attestation, so a register has no status. */
function returnStatus(report: ReportRecord) {
  if (report.kind !== 'monthly_return') return null
  if (report.submission === 'acknowledged') return <Badge>{m.returns_acknowledged()}</Badge>
  if (report.submission === 'queued') return <Badge variant="secondary">{m.returns_queued()}</Badge>
  if (report.attestedAt !== null) return <Badge variant="secondary">{m.returns_attested()}</Badge>
  return <Badge variant="outline">{m.returns_not_attested()}</Badge>
}
