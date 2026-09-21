import { Row, RowList } from '@/components/operational-row'
import { useHqConfig, usePermissions } from '@/features/session'
import { Badge } from '@pleadli/ui/badge'
import { buttonVariants } from '@pleadli/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@pleadli/ui/table'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { m } from '@/paraglide/messages'
import { periodText } from './period'
import { useDrafts, useReceivedReturns, useReports } from './queries'
import { catalogEntry } from './report-catalog'
import { type ReportRecord } from './schema'

/**
 * The library: what this installation has written and issued. Reports are
 * documents only. A draft is a report still being composed; an issued report
 * is numbered and fingerprinted and does not change. Starting one is under
 * New report.
 */
export function ReportsPage() {
  const { data: hqConfig } = useHqConfig()
  const { can } = usePermissions()
  const { data: history } = useReports()
  const { data: drafts } = useDrafts()
  const headOffice = hqConfig?.isHeadOffice ?? false
  const { data: received } = useReceivedReturns(headOffice && can('hq.reports'))
  const open = (drafts ?? []).filter((draft) => draft.issuedReportId === null)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_reports_reports()}</h1>
          <p className="md:max-w-lg">{m.reports_page_about()}</p>
        </div>
        {can('report.generate') && (
          <div className="page-actions">
            <Link to="/reports/new" className={buttonVariants({ size: 'sm' })}>
              {m.reports_new_report()}
            </Link>
          </div>
        )}
      </header>

      {open.length > 0 && (
        <section className="page-section">
          <div className="section-head">
            <h2>{m.reports_drafts()}</h2>
          </div>
          <RowList>
            {open.map((draft) => (
              <Row
                key={draft.id}
                title={draft.title}
                summary={m.reports_edited_by({ name: draft.updatedByName, when: formatDistanceToNowStrict(draft.updatedAt, { addSuffix: true }) })}
                trailing={
                  <Link to="/reports/$report" params={{ report: draft.id }} className={buttonVariants({ size: 'xs', variant: 'secondary' })}>
                    {m.reports_continue()}
                  </Link>
                }
              />
            ))}
          </RowList>
        </section>
      )}

      <section className="page-section">
        <div className="section-head">
          <h2>{m.reports_issued()}</h2>
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
                    <Link to="/reports/$report" params={{ report: report.id }}>
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
                      <Link to="/reports/$report" params={{ report: row.id }}>
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
