import { TodayBoard, UpcomingVisits } from './visit-board'
import { VisitDetailDialog } from './visit-detail'
import { VisitRulesCard } from './visit-rules-card'
import { isPrivilegedType, visitListItemFullName, visitStatusLabel, visitStatusVariant, visitStatuses, visitTypeLabel, visitTypes, type VisitListItem } from './schema'
import { useVisits } from './queries'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import { m } from '@/paraglide/messages'

const time = (ms: number | null) => (ms ? format(ms, 'PPp') : '·')

/** Visits: today's board and what is coming, then the whole ledger. A visit
 * moves requested, scheduled, checked in at the gate, in progress, completed,
 * or ends refused, cancelled or as a no show. */
export function VisitsPage() {
  const { data: visits } = useVisits()
  const [status, setStatus] = useState<string>('all')
  const [type, setType] = useState<string>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const open = useMemo(() => visits.find((v) => v.id === openId) ?? null, [visits, openId])

  const filtered = useMemo(
    () => visits.filter((v) => (status === 'all' || v.status === status) && (type === 'all' || v.visitType === type)),
    [visits, status, type],
  )
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of visits) map.set(v.status, (map.get(v.status) ?? 0) + 1)
    return map
  }, [visits])

  const columns: DataTableColumnDef<VisitListItem>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span className="cursor-pointer rounded-md bg-primary/15 px-3 py-1 text-xs" onClick={() => setOpenId(row.original.id)}>
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: 'prisonerId',
        header: m.route_visits_prisoner_id(),
        cell: ({ row }) => (
          <Link to="/prisoners/$prisonerId" params={{ prisonerId: row.original.prisonerId }} className="inline-block rounded-md bg-primary/15 px-3 py-1 text-xs">
            {row.original.prisonerId}
          </Link>
        ),
      },
      { id: 'prisoner', accessorFn: (row) => visitListItemFullName(row), header: m.route_visits_prisoner() },
      { accessorKey: 'visitorName', header: m.route_visits_visitor() },
      { accessorKey: 'visitorId', header: m.route_visits_visitor_id(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'visitorIdentification', header: m.route_visits_identification(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'relationship', header: m.route_visits_relationship(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      {
        accessorKey: 'visitType',
        header: m.route_visits_type(),
        cell: ({ getValue }) => <Badge variant="outline">{visitTypeLabel(getValue<string>())}</Badge>,
      },
      {
        accessorKey: 'privileged',
        header: m.route_visits_privileged(),
        cell: ({ getValue }) => (getValue<boolean>() ? <Badge variant="secondary">{m.route_visits_privileged()}</Badge> : 'No'),
      },
      { accessorKey: 'partySize', header: m.route_visits_visitors() },
      {
        accessorKey: 'status',
        header: m.route_visits_status(),
        cell: ({ getValue }) => <Badge variant={visitStatusVariant(getValue<string>())}>{visitStatusLabel(getValue<string>())}</Badge>,
      },
      { accessorKey: 'visitedAt', header: m.route_visits_scheduled(), cell: ({ getValue }) => time(getValue<number>()) },
      { accessorKey: 'durationMinutes', header: m.route_visits_planned_min() },
      { accessorKey: 'checkedInAt', header: m.route_visits_checked_in(), cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'checkedInBy', header: m.route_visits_checked_in_by(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'idVerified', header: m.route_visits_id_checked(), cell: ({ getValue }) => (getValue<boolean>() ? m.route_visits_yes() : 'No') },
      { accessorKey: 'searchDone', header: m.route_visits_searched(), cell: ({ getValue }) => (getValue<boolean>() ? m.route_visits_yes() : 'No') },
      { accessorKey: 'startedAt', header: m.route_visits_started(), cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'endedAt', header: m.route_visits_ended(), cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'supervisingOfficer', header: m.route_visits_supervising_officer(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'authorizedBy', header: m.route_visits_authorized_by(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'decidedBy', header: m.route_visits_decided_by(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'decidedAt', header: m.route_visits_decided(), cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'decisionReason', header: m.route_visits_reason(), cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      {
        accessorKey: 'notes',
        header: m.route_visits_notes(),
        cell: ({ row }) => (isPrivilegedType(row.original.visitType) ? m.route_visits_not_recorded() : (row.original.notes ?? '·')),
      },
      { accessorKey: 'createdAt', header: m.route_visits_created(), cell: ({ getValue }) => time(getValue<number>()) },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_visits_visits()}</h1>
          <p className="md:max-w-lg">{m.route_visits_who_is_expected_today_who_is()}</p>
        </div>
      </header>

      <VisitRulesCard />
      <TodayBoard visits={visits} />
      <UpcomingVisits visits={visits} />

      <section className="page-section flex flex-col gap-3">
        <h2 className="text-sm font-medium">{m.route_visits_all_visits()}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ value: 'all', label: m.route_visits_all() }, ...visitStatuses].map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={status === s.value}
              onClick={() => setStatus(s.value)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs',
                status === s.value ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted/60',
              )}
            >
              {s.label} {s.value === 'all' ? visits.length : (counts.get(s.value) ?? 0)}
            </button>
          ))}
          <select
            aria-label={m.route_visits_visit_type()}
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            <option value="all">{m.route_visits_all_types()}</option>
            {visitTypes.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          aria-label={m.route_visits_visits()}
          data={filtered}
          columns={columns}
          getRowId={(row) => row.id}
          emptyMessage={m.route_visits_no_visits_match()}
          searchPlaceholder={m.route_visits_search_visits_by_visitor_or_prisoner()}
        />
      </section>

      <VisitDetailDialog visit={open} prisonerName={open ? visitListItemFullName(open) : undefined} onClose={() => setOpenId(null)} />
    </article>
  )
}
