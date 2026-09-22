import { Row, RowList } from '@/components/operational-row'
import { useConnectivityStatus } from '@/features/connectivity'
import type { TodayView } from '@/features/obligations'
import { catalogEntry, useClosedMonthReturn, type ReturnStage } from '@/features/reports'
import { usePermissions } from '@/features/session'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { formatDistanceToNowStrict } from 'date-fns/formatDistanceToNowStrict'
import { m } from '@/paraglide/messages'

/** How many recently produced documents to list. */
const RECENT = 3

const UNLINKED = ['not_connected', 'awaiting_approval', 'rejected', 'revoked', 'disconnected']

const openLink = 'inline-flex items-center gap-1 text-muted-foreground transition-colors duration-100 hover:text-foreground motion-reduce:transition-none'

function OpenReport({ id }: { id: string | null }) {
  return id ? (
    <Link to="/reports/$report" params={{ report: id }} className={openLink}>
      {m.ops_open()}
      <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
    </Link>
  ) : (
    <Link to="/reports" className={openLink}>
      {m.attention_produce_return()}
      <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
    </Link>
  )
}

function stageText(stage: ReturnStage, attestedBy: string | null, acknowledgedAt: number | null) {
  const by = attestedBy ?? ''
  switch (stage) {
    case 'not_produced':
      return m.docs_return_not_produced()
    case 'awaiting_attestation':
      return m.docs_return_awaiting_attestation()
    case 'ready_to_send':
      return m.docs_return_ready({ name: by })
    case 'attested':
      return m.docs_return_attested_offline({ name: by })
    case 'queued':
      return m.docs_return_queued({ name: by })
    case 'send_failed':
      return m.docs_return_send_failed({ name: by })
    case 'acknowledged':
      return m.docs_return_acknowledged({ name: by, when: acknowledgedAt ? formatDistanceToNowStrict(acknowledgedAt, { addSuffix: true }) : '' })
  }
}

/**
 * The paper side of the facility's work: where the return for the month that
 * has just closed stands, the legal documents still missing, and what was
 * produced lately. It only reports what the node holds; producing and
 * attesting happen in Reports.
 */
export function DocumentsSection({ today }: { today: TodayView }) {
  const { can } = usePermissions()
  const { data: connection } = useConnectivityStatus()
  const canRead = can('report.read')
  const { month, report, reports, stage, loading } = useClosedMonthReturn(canRead, connection ? !UNLINKED.includes(connection.state) : false)
  const pending = today.obligations.filter((o) => o.kind === 'instrument_pending' || o.kind === 'sentence_missing').length
  const recent = (reports ?? []).filter((r) => r.id !== report?.id).slice(0, RECENT)

  if (!canRead && pending === 0) return null
  return (
    <section className="page-section" aria-labelledby="documents-heading">
      <div className="section-head">
        <h2 id="documents-heading">{m.docs_heading()}</h2>
        {canRead && <Link to="/reports">{m.route_reports_reports()}</Link>}
      </div>
      <RowList>
        {canRead && !loading && month && (
          <Row
            title={m.docs_return_for({ month: format(month.from, 'MMMM yyyy') })}
            summary={stageText(stage, report?.attestedByName ?? null, report?.acknowledgedAt ?? null)}
            trailing={<OpenReport id={report?.id ?? null} />}
          />
        )}
        {pending > 0 && <Row title={m.docs_pending_title()} summary={m.docs_pending_summary({ count: pending })} />}
        {recent.map((r) => (
          <Row
            key={r.id}
            title={catalogEntry(r.kind)?.title() ?? r.title}
            summary={`${r.reference} · ${format(r.generatedAt, 'd MMM yyyy, HH:mm')}`}
            trailing={<OpenReport id={r.id} />}
          />
        ))}
      </RowList>
    </section>
  )
}
