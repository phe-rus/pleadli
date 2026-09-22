import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { StatTile } from '@/components/stat-tile'
import { Tag } from '@/components/status-tag'
import { isPeriod, periods, returnsOptions, useReturns, type PeriodId } from '@/features/reports'
import { reasonLabel, responsibleLabel } from '@/features/sittings'
import { plural } from '@/lib/present'
import { AlarmClockIcon, CalendarCheckOut01Icon, FolderViewIcon, GavelIcon } from '@hugeicons/core-free-icons'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'

export const Route = createFileRoute('/_public/reports/')({
  validateSearch: (search: Record<string, unknown>): { period?: PeriodId } => (isPeriod(search.period) ? { period: search.period } : {}),
  loaderDeps: ({ search }) => ({ period: search.period ?? '90' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...returnsOptions(Number(deps.period)), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** A bar sized against the largest figure in its list, so a list reads at a glance. */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span aria-hidden className="block h-1.5 w-full max-w-40 rounded-full bg-muted">
      <span className="block h-full rounded-full bg-primary" style={{ width: `${max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0}%` }} />
    </span>
  )
}

/** What this court did over a period, worked out from its own records: the
 * backlog by age, why sittings were adjourned and who was responsible, and how
 * many records and decisions were completed. It reports only what was recorded.
 * A sitting closed with no structured reason simply is not in the cause figures,
 * and no target or benchmark is asserted. */
function RouteComponent() {
  const { period = '90' } = Route.useSearch()
  const current = periods.find((p) => p.id === period) ?? periods[1]
  const { data: r } = useReturns(current.days)
  const reasonMax = Math.max(0, ...r.byReason.map((c) => c.count))
  const responsibleMax = Math.max(0, ...r.byResponsible.map((c) => c.count))
  const backlogMax = Math.max(0, ...r.backlog.map((c) => c.count))
  const unsigned = Math.max(0, r.closedSittings - r.signedRecords)

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Returns</h1>
          <p>
            {format(r.from, 'd MMM yyyy')} to {format(r.to - 1, 'd MMM yyyy')}. What this court recorded: the backlog, why sittings were adjourned, and what was completed.
          </p>
        </div>
      </header>

      <nav aria-label="Period" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {periods.map((item) => (
          <Link
            key={item.id}
            to="/reports"
            search={{ period: item.id }}
            replace
            aria-current={item.id === period ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-3 py-1.5 no-underline',
              item.id === period ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <section aria-label="Figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Sittings"
          icon={CalendarCheckOut01Icon}
          tint="primary"
          value={r.sittings.total}
          meta={<Badge variant="secondary">{r.sittings.held} held</Badge>}
          caption={`${r.sittings.adjourned} adjourned, ${r.sittings.cancelled} cancelled, ${r.sittings.scheduled} still to come`}
        />
        <StatTile
          label="Adjournments"
          icon={AlarmClockIcon}
          tint={r.adjournmentsWithoutDate > 0 ? 'rose' : 'amber'}
          value={r.adjournments}
          meta={r.adjournmentsWithoutDate > 0 ? <Badge variant="destructive">{r.adjournmentsWithoutDate} with no next date</Badge> : <Badge variant="secondary">All dated</Badge>}
          caption={r.closedSittings > 0 ? `${Math.round((r.sittings.adjourned / r.closedSittings) * 100)}% of the sittings that were closed` : 'No sitting was closed in this period'}
        />
        <StatTile label="Open cases" icon={FolderViewIcon} tint="emerald" value={r.openCases} meta={<Badge variant="secondary">{r.concludedInPeriod} concluded</Badge>} caption="Before the court now, and concluded in this period" />
        <StatTile
          label="Decisions"
          icon={GavelIcon}
          tint={r.reservedDrafts > 0 ? 'rose' : 'emerald'}
          value={r.deliveredDecisions}
          meta={r.reservedDrafts > 0 ? <Badge variant="destructive">{r.reservedDrafts} reserved</Badge> : <Badge variant="secondary">None reserved</Badge>}
          caption={r.oldestReservedDays != null ? `The oldest reserved decision is ${plural(r.oldestReservedDays, 'day')} old` : 'Delivered in this period'}
        />
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-labelledby="reasons" className="page-section">
          <h2 id="reasons">Why sittings were adjourned</h2>
          {r.byReason.length === 0 ? (
            <EmptyNote>No sitting was adjourned in this period.</EmptyNote>
          ) : (
            <RowList>
              {r.byReason.map((c) => (
                <Row key={c.key} aligned title={reasonLabel(c.key)} summary={<Bar value={c.count} max={reasonMax} />} trailing={<Tag tone="neutral">{c.count}</Tag>} />
              ))}
            </RowList>
          )}
        </section>

        <section aria-labelledby="responsible" className="page-section">
          <h2 id="responsible">Whose doing</h2>
          {r.byResponsible.length === 0 ? (
            <EmptyNote>Nothing to show for this period.</EmptyNote>
          ) : (
            <RowList>
              {r.byResponsible.map((c) => (
                <Row key={c.key} aligned title={responsibleLabel(c.key)} summary={<Bar value={c.count} max={responsibleMax} />} trailing={<Tag tone="neutral">{c.count}</Tag>} />
              ))}
            </RowList>
          )}
          {r.notProduced > 0 && <p className="text-muted-foreground">{plural(r.notProduced, 'time')} an accused person in custody was recorded as not produced from custody.</p>}
        </section>

        <section aria-labelledby="backlog" className="page-section">
          <h2 id="backlog">Open cases by age</h2>
          <RowList>
            {r.backlog.map((c) => (
              <Row key={c.key} aligned title={c.key} summary={<Bar value={c.count} max={backlogMax} />} trailing={<Tag tone="neutral">{c.count}</Tag>} />
            ))}
          </RowList>
          <p className="text-muted-foreground">Age is counted from the date registered, or from the day the case was entered here when no date was given.</p>
        </section>

        <section aria-labelledby="most" className="page-section">
          <h2 id="most">Most adjourned cases</h2>
          {r.mostAdjourned.length === 0 ? (
            <EmptyNote>No case was adjourned in this period.</EmptyNote>
          ) : (
            <RowList>
              {r.mostAdjourned.map((c) => (
                <Row
                  key={c.caseId}
                  aligned
                  title={
                    <Link to="/cases/$caseId" params={{ caseId: c.caseId }} className="text-foreground">
                      {c.courtNumber}, {c.title}
                    </Link>
                  }
                  trailing={<Tag tone={c.status === 'open' ? 'open' : 'done'}>{plural(c.adjournments, 'adjournment')}</Tag>}
                />
              ))}
            </RowList>
          )}
        </section>

        <section aria-labelledby="completed" className="page-section">
          <h2 id="completed">Records</h2>
          <RowList>
            <Row aligned title="Sittings closed" trailing={<Tag tone="neutral">{r.closedSittings}</Tag>} />
            <Row aligned title="Records signed" trailing={<Tag tone="done">{r.signedRecords}</Tag>} />
            <Row aligned marker={unsigned > 0 ? 'open' : undefined} title="Closed and not yet signed" trailing={<Tag tone={unsigned > 0 ? 'open' : 'neutral'}>{unsigned}</Tag>} />
            <Row aligned title="Sittings recorded in audio" trailing={<Tag tone="neutral">{r.recordings}</Tag>} />
          </RowList>
        </section>
      </div>
    </article>
  )
}
