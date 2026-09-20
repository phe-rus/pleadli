import { admissionInstrumentLabel, custodyStatusLabel, prisonerStatusLabel } from '@/features/prisoners'
import { facilityStatusLabel } from '@/features/facilities'
import { healthEventTypeLabel } from '@/features/health-events'
import { releaseTypeLabel } from '@/features/releases'
import { transferDirectionLabel, transferStateLabel } from '@/features/transfers'
import { visitStatusLabel, visitTypeLabel } from '@/features/visits'
import { useWorkspace } from '@/features/workspace/tabs-store'
import { ArrowLeft01Icon, PrinterIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button, buttonVariants } from '@pleadli/ui/button'
import { Link } from '@tanstack/react-router'
import { differenceInCalendarDays } from 'date-fns/differenceInCalendarDays'
import { format } from 'date-fns/format'
import { useEffect, type ReactNode } from 'react'
import { periodText } from './period'
import { catalogEntry } from './report-catalog'
import { useReport } from './queries'
import { AttestationBlock, ReturnPanel } from './return-panel'
import { profileEducationLabel, profileNationalityLabel } from './statistics-board'
import {
  admissionRowsSchema,
  dischargeRowsSchema,
  monthlyReturnSchema,
  networkRowsSchema,
  remandRowsSchema,
  transferRowsSchema,
  visitRowsSchema,
  type GeneratedReport,
} from './schema'
import { m } from '@/paraglide/messages'

const humanize = (raw: string) => (raw ? raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ') : '')
const date = (ms: number | null | undefined) => (ms == null ? '' : format(ms, 'd MMM yyyy'))
const fullName = (first: string, last: string, other?: string | null) => [first, other, last].filter(Boolean).join(' ')

type Column<T> = { header: string; cell: (row: T, index: number) => ReactNode; align?: 'right' }

/** A register: numbered rows under a heading row that repeats on every printed
 * page, and a count at the foot so a short print is noticed. */
function Register<T>({ columns, rows }: { columns: readonly Column<T>[]; rows: readonly T[] }) {
  if (rows.length === 0) return <p>{m.reports_nothing_recorded_in_this_report()}</p>
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-xs">
        <thead className="print:table-header-group">
          <tr>
            <th className="w-8 text-left">{m.reports_column_no()}</th>
            {columns.map((column) => (
              <th key={column.header} className={column.align === 'right' ? 'text-right' : 'text-left'}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="break-inside-avoid align-top">
              <td>{index + 1}</td>
              {columns.map((column) => (
                <td key={column.header} className={column.align === 'right' ? 'text-right tabular-nums' : undefined}>
                  {column.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>{m.reports_total_entries({ count: rows.length })}</p>
    </div>
  )
}

/** Label and count rows with a total, for one breakdown of the monthly return. */
function CountTable({ title, counts, label }: { title: string; counts: readonly { label: string; count: number }[]; label?: (raw: string) => string }) {
  const total = counts.reduce((sum, row) => sum + row.count, 0)
  return (
    <section className="flex flex-col gap-1 break-inside-avoid">
      <h4>{title}</h4>
      {counts.length === 0 ? (
        <p>{m.reports_none_in_this_period()}</p>
      ) : (
        <table className="w-full">
          <tbody>
            {counts.map((row) => (
              <tr key={row.label}>
                <td>{label ? label(row.label) : humanize(row.label)}</td>
                <td className="w-16 text-right tabular-nums">{row.count}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>{m.reports_total()}</strong>
              </td>
              <td className="text-right tabular-nums">
                <strong>{total}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  )
}

function Facts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td className="w-56 align-top text-muted-foreground">{label}</td>
            <td className="text-right align-top tabular-nums">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

/** The monthly return: what the prison held at the time the report was made,
 * and what moved during the period, in the order the returns are read. */
function MonthlyReturnBody({ body, asAt }: { body: unknown; asAt: number }) {
  const parsed = monthlyReturnSchema.safeParse(body)
  if (!parsed.success) return <p>{m.reports_this_report_could_not_be_read()}</p>
  const r = parsed.data
  const p = r.population
  const occupancy = p.capacity ? Math.round((p.held / p.capacity) * 100) : null

  return (
    <>
      <Part title={m.reports_population_on({ date: format(asAt, 'd MMM yyyy') })}>
        <Facts
          rows={[
            [m.reports_held_in_custody(), p.held],
            [m.reports_convicted(), p.convicted],
            [m.reports_awaiting_trial(), p.unconvicted],
            [m.reports_civil_prisoners(), p.civil],
            [m.reports_male(), p.male],
            [m.reports_female(), p.female],
            ...(p.sexNotRecorded > 0 ? ([[m.reports_sex_not_recorded(), p.sexNotRecorded]] as const) : []),
            [m.reports_in_transit(), p.inTransit],
            [m.reports_approved_capacity(), p.capacity ?? m.reports_not_set()],
            ...(occupancy != null ? ([[m.reports_occupancy(), `${occupancy}%`]] as const) : []),
          ]}
        />
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <CountTable title={m.reports_by_age_group()} counts={p.ageGroups} label={(raw) => raw} />
          <CountTable title={m.reports_by_nationality()} counts={p.nationality} label={(raw) => profileNationalityLabel[raw] ?? humanize(raw)} />
          <CountTable title={m.reports_by_education()} counts={p.education} label={(raw) => profileEducationLabel[raw] ?? humanize(raw)} />
          <CountTable title={m.reports_by_offence()} counts={p.offenceType} label={(raw) => raw} />
        </div>
      </Part>

      <Part title={m.reports_admissions()}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <CountTable title={m.reports_by_category()} counts={r.admissions} label={prisonerStatusLabel} />
          <CountTable title={m.reports_by_authority()} counts={r.admissionInstruments} label={admissionInstrumentLabel} />
        </div>
      </Part>

      <Part title={m.reports_discharges()}>
        <CountTable title={m.reports_by_type()} counts={r.discharges} label={releaseTypeLabel} />
      </Part>

      <Part title={m.reports_transfers()}>
        <Facts
          rows={[
            [m.reports_transferred_out(), r.transfersOut],
            [m.reports_transferred_in(), r.transfersIn],
          ]}
        />
      </Part>

      <Part title={m.reports_court_and_visits()}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <CountTable title={m.reports_court_productions()} counts={r.courtProductions} />
          <CountTable title={m.reports_visits_by_outcome()} counts={r.visits} label={visitStatusLabel} />
          <CountTable title={m.reports_visits_by_type()} counts={r.visitTypes} label={visitTypeLabel} />
        </div>
      </Part>

      <Part title={m.reports_health_and_complaints()}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <CountTable title={m.reports_health_events()} counts={r.healthEvents} label={healthEventTypeLabel} />
          <section className="flex flex-col gap-1 break-inside-avoid">
            <h4>{m.reports_requests_and_complaints()}</h4>
            <Facts
              rows={[
                [m.reports_raised(), r.complaints.raised],
                [m.reports_resolved(), r.complaints.resolved],
                [m.reports_open_now(), r.complaints.openNow],
              ]}
            />
          </section>
        </div>
      </Part>
    </>
  )
}

function RegisterBody({ kind, body, asAt }: { kind: string; body: unknown; asAt: number }) {
  const unreadable = <p>{m.reports_this_report_could_not_be_read()}</p>
  switch (kind) {
    case 'admission_register': {
      const parsed = admissionRowsSchema.safeParse(body)
      if (!parsed.success) return unreadable
      return (
        <Register
          rows={parsed.data.rows}
          columns={[
            { header: m.reports_column_prisoner_no(), cell: (r) => r.prisonerNumber ?? '' },
            { header: m.reports_column_name(), cell: (r) => fullName(r.firstName, r.lastName, r.otherNames) },
            { header: m.reports_column_category(), cell: (r) => prisonerStatusLabel(r.status) },
            { header: m.reports_column_authority(), cell: (r) => [admissionInstrumentLabel(r.admissionInstrumentType), r.admissionAuthority].filter(Boolean).join(', ') },
            { header: m.reports_column_offence(), cell: (r) => r.offence ?? '' },
            { header: m.reports_column_admitted(), cell: (r) => date(r.admittedAt) },
            { header: m.reports_column_now(), cell: (r) => custodyStatusLabel(r.currentStatus) },
          ]}
        />
      )
    }
    case 'discharge_register': {
      const parsed = dischargeRowsSchema.safeParse(body)
      if (!parsed.success) return unreadable
      return (
        <Register
          rows={parsed.data.rows}
          columns={[
            { header: m.reports_column_prisoner_no(), cell: (r) => r.prisonerNumber ?? '' },
            { header: m.reports_column_name(), cell: (r) => fullName(r.firstName, r.lastName) },
            { header: m.reports_column_type(), cell: (r) => releaseTypeLabel(r.releaseType) },
            { header: m.reports_column_date(), cell: (r) => date(r.releasedAt) },
            { header: m.reports_column_ordered_by(), cell: (r) => r.orderedBy ?? '' },
            { header: m.reports_column_authorised_by(), cell: (r) => r.authorisedBy ?? '' },
          ]}
        />
      )
    }
    case 'transfer_register': {
      const parsed = transferRowsSchema.safeParse(body)
      if (!parsed.success) return unreadable
      return (
        <Register
          rows={parsed.data.rows}
          columns={[
            { header: m.reports_column_date(), cell: (r) => date(r.transferredAt) },
            { header: m.reports_column_direction(), cell: (r) => transferDirectionLabel(r.direction) },
            { header: m.reports_column_state(), cell: (r) => transferStateLabel(r.direction, r.state) },
            { header: m.reports_column_person(), cell: (r) => [r.personName, r.prisonerNumber].filter(Boolean).join(' · ') },
            { header: m.reports_column_other_prison(), cell: (r) => r.otherPrisonName ?? '' },
            { header: m.reports_column_order(), cell: (r) => [r.orderReference, r.orderingAuthority].filter(Boolean).join(', ') },
            { header: m.reports_column_reason(), cell: (r) => r.reason ?? '' },
          ]}
        />
      )
    }
    case 'visitors_register': {
      const parsed = visitRowsSchema.safeParse(body)
      if (!parsed.success) return unreadable
      return (
        <Register
          rows={parsed.data.rows}
          columns={[
            { header: m.reports_column_date(), cell: (r) => date(r.visitedAt) },
            { header: m.reports_column_visitor(), cell: (r) => [r.visitorName, r.relationship].filter(Boolean).join(', ') },
            { header: m.reports_column_prisoner(), cell: (r) => [fullName(r.prisonerFirstName, r.prisonerLastName), r.prisonerNumber].filter(Boolean).join(' · ') },
            { header: m.reports_column_type(), cell: (r) => visitTypeLabel(r.visitType) },
            { header: m.reports_column_outcome(), cell: (r) => visitStatusLabel(r.status) },
            { header: m.reports_column_party(), cell: (r) => r.partySize, align: 'right' },
            { header: m.reports_column_time(), cell: (r) => (r.startedAt ? `${format(r.startedAt, 'HH:mm')}${r.endedAt ? ` to ${format(r.endedAt, 'HH:mm')}` : ''}` : '') },
          ]}
        />
      )
    }
    case 'remand_list': {
      const parsed = remandRowsSchema.safeParse(body)
      if (!parsed.success) return unreadable
      return (
        <Register
          rows={parsed.data.rows}
          columns={[
            { header: m.reports_column_prisoner_no(), cell: (r) => r.prisonerNumber ?? '' },
            { header: m.reports_column_name(), cell: (r) => fullName(r.firstName, r.lastName) },
            { header: m.reports_column_offence(), cell: (r) => r.offence ?? '' },
            { header: m.reports_column_remanded_by(), cell: (r) => r.admissionAuthority ?? '' },
            { header: m.reports_column_admitted(), cell: (r) => date(r.admittedAt) },
            { header: m.reports_column_days_held(), cell: (r) => differenceInCalendarDays(asAt, r.admittedAt), align: 'right' },
            { header: m.reports_column_high_court_only(), cell: (r) => (r.highCourtOnlyOffence ? m.reports_yes() : m.reports_no()) },
            { header: m.reports_column_last_produced(), cell: (r) => date(r.lastProducedAt) },
          ]}
        />
      )
    }
    case 'network_register': {
      const parsed = networkRowsSchema.safeParse(body)
      if (!parsed.success) return unreadable
      return (
        <Register
          rows={parsed.data.rows}
          columns={[
            { header: m.reports_column_facility_no(), cell: (r) => r.facilityNumber },
            { header: m.reports_column_facility(), cell: (r) => r.name },
            { header: m.reports_column_region(), cell: (r) => r.region },
            { header: m.reports_column_location(), cell: (r) => r.location },
            { header: m.reports_column_status(), cell: (r) => facilityStatusLabel(r.status) },
            { header: m.reports_column_officers(), cell: (r) => r.officerCount, align: 'right' },
            { header: m.reports_column_held(), cell: (r) => r.heldAtLastSync, align: 'right' },
            { header: m.reports_column_last_synced(), cell: (r) => (r.lastSyncedAt ? format(r.lastSyncedAt, 'd MMM yyyy, HH:mm') : m.reports_never()) },
          ]}
        />
      )
    }
    default:
      return unreadable
  }
}

/** One frame for every printed return: who issued it, its reference and date,
 * the period it covers, the body, and a footer that says who produced it and
 * carries the fingerprint of the stored figures, so a printed copy can be
 * checked against the record. On paper the footer repeats on every page. */
function ReportSheet({ report }: { report: GeneratedReport }) {
  const { document } = report
  const entry = catalogEntry(report.kind)
  const place = [document.issuer.location, document.issuer.region].filter(Boolean).join(', ')

  return (
    <article className="paper mx-auto flex w-full max-w-[210mm] flex-col gap-6 p-10 print:table print:max-w-none print:p-0">
      {entry?.landscape && <style>{'@media print { @page { size: A4 landscape; margin: 12mm 10mm 18mm } }'}</style>}
      <div className="paper-body flex flex-col gap-6 print:table-row-group">
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0">{document.issuer.name?.trim() || m.documents_pleadli_prisons()}</h2>
            <p>{[document.issuer.facilityNumber, place].filter(Boolean).join(' · ')}</p>
          </div>
          <table className="text-right">
            <tbody>
              <tr>
                <td className="pr-3 text-muted-foreground">{m.reports_reference()}</td>
                <td>
                  <strong>{report.reference}</strong>
                </td>
              </tr>
              <tr>
                <td className="pr-3 text-muted-foreground">{m.reports_produced()}</td>
                <td>{format(report.generatedAt, 'd MMMM yyyy')}</td>
              </tr>
            </tbody>
          </table>
        </header>

        <div className="flex flex-col gap-1">
          <h1 className="m-0">{report.title}</h1>
          <p>{periodText(document.periodFrom, document.periodTo)}</p>
        </div>

        {report.kind === 'monthly_return' ? <MonthlyReturnBody body={document.body} asAt={document.asAt} /> : <RegisterBody kind={report.kind} body={document.body} asAt={document.asAt} />}
        {report.kind === 'monthly_return' && <AttestationBlock report={report} />}
      </div>

      <footer className="paper-footer mt-6 flex flex-col gap-0.5 border-t border-black/60 pt-2 print:table-footer-group">
        <p>{m.reports_footer_produced_by({ name: report.generatedByName, at: format(report.generatedAt, 'd MMM yyyy, HH:mm') })}</p>
        <p>{m.reports_footer_fingerprint({ hash: report.contentHash.slice(0, 16), version: report.templateVersion })}</p>
      </footer>
    </article>
  )
}

/** A stored report open as a tab: the sheet as it will print, and a button that
 * opens the print dialog. The figures were fixed when the report was made, so
 * opening it later, or on another day, shows the same numbers. */
export function ReportPage({ id }: { id: string }) {
  const { data: report, isPending, isError } = useReport(id)
  const { renameTab } = useWorkspace()

  useEffect(() => {
    if (report) renameTab(`report:${id}`, `${report.reference} · ${report.title}`)
  }, [id, report, renameTab])

  return (
    <div className="flex flex-col gap-4 p-6 print:p-0">
      <div className="mx-auto flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/reports" className={buttonVariants({ size: 'sm', variant: 'ghost' })}>
          <HugeiconsIcon icon={ArrowLeft01Icon} />
          {m.reports_all_reports()}
        </Link>
        {report && (
          <Button onClick={() => window.print()}>
            <HugeiconsIcon icon={PrinterIcon} />
            {m.reports_print()}
          </Button>
        )}
      </div>
      {report?.kind === 'monthly_return' && <ReturnPanel report={report} />}
      {isPending ? null : isError || !report ? <p className="mx-auto">{m.reports_could_not_open()}</p> : <ReportSheet report={report} />}
    </div>
  )
}
