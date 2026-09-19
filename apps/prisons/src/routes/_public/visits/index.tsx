import {
  TodayBoard,
  UpcomingVisits,
  VisitDetailDialog,
  VisitRulesCard,
  allVisitsOptions,
  isPrivilegedType,
  visitListItemFullName,
  visitRulesOptions,
  visitStatusLabel,
  visitStatusVariant,
  visitStatuses,
  visitTypeLabel,
  visitTypes,
  useVisits,
} from '@/features/visits'
import type { VisitListItem } from '@/features/visits'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/visits/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...allVisitsOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...visitRulesOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

const time = (ms: number | null) => (ms ? format(ms, 'PPp') : '·')

/** Visits: today's board and what is coming, then the whole ledger. A visit
 * moves requested, scheduled, checked in at the gate, in progress, completed,
 * or ends refused, cancelled or as a no show. */
function RouteComponent() {
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
        header: 'Prisoner ID',
        cell: ({ row }) => (
          <Link to="/prisoners/$prisonerId" params={{ prisonerId: row.original.prisonerId }} className="inline-block rounded-md bg-primary/15 px-3 py-1 text-xs">
            {row.original.prisonerId}
          </Link>
        ),
      },
      { id: 'prisoner', accessorFn: (row) => visitListItemFullName(row), header: 'Prisoner' },
      { accessorKey: 'visitorName', header: 'Visitor' },
      { accessorKey: 'visitorId', header: 'Visitor ID', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'visitorIdentification', header: 'Identification', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'relationship', header: 'Relationship', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      {
        accessorKey: 'visitType',
        header: 'Type',
        cell: ({ getValue }) => <Badge variant="outline">{visitTypeLabel(getValue<string>())}</Badge>,
      },
      {
        accessorKey: 'privileged',
        header: 'Privileged',
        cell: ({ getValue }) => (getValue<boolean>() ? <Badge variant="secondary">Privileged</Badge> : 'No'),
      },
      { accessorKey: 'partySize', header: 'Visitors' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant={visitStatusVariant(getValue<string>())}>{visitStatusLabel(getValue<string>())}</Badge>,
      },
      { accessorKey: 'visitedAt', header: 'Scheduled', cell: ({ getValue }) => time(getValue<number>()) },
      { accessorKey: 'durationMinutes', header: 'Planned (min)' },
      { accessorKey: 'checkedInAt', header: 'Checked in', cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'checkedInBy', header: 'Checked in by', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'idVerified', header: 'ID checked', cell: ({ getValue }) => (getValue<boolean>() ? 'Yes' : 'No') },
      { accessorKey: 'searchDone', header: 'Searched', cell: ({ getValue }) => (getValue<boolean>() ? 'Yes' : 'No') },
      { accessorKey: 'startedAt', header: 'Started', cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'endedAt', header: 'Ended', cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'supervisingOfficer', header: 'Supervising officer', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'authorizedBy', header: 'Authorized by', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'decidedBy', header: 'Decided by', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      { accessorKey: 'decidedAt', header: 'Decided', cell: ({ getValue }) => time(getValue<number | null>()) },
      { accessorKey: 'decisionReason', header: 'Reason', cell: ({ getValue }) => getValue<string | null>() ?? '·' },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ row }) => (isPrivilegedType(row.original.visitType) ? 'Not recorded' : (row.original.notes ?? '·')),
      },
      { accessorKey: 'createdAt', header: 'Created', cell: ({ getValue }) => time(getValue<number>()) },
    ],
    [],
  )

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Visits</h1>
        <p className="md:max-w-lg">Who is expected today, who is at the gate, and every visit at this facility.</p>
      </section>

      <VisitRulesCard />
      <TodayBoard visits={visits} />
      <UpcomingVisits visits={visits} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">All visits</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ value: 'all', label: 'All' }, ...visitStatuses].map((s) => (
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
            aria-label="Visit type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            <option value="all">All types</option>
            {visitTypes.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          aria-label="Visits"
          data={filtered}
          columns={columns}
          getRowId={(row) => row.id}
          emptyMessage="No visits match."
          searchPlaceholder="Search visits by visitor or prisoner…"
        />
      </section>

      <VisitDetailDialog visit={open} prisonerName={open ? visitListItemFullName(open) : undefined} onClose={() => setOpenId(null)} />
    </article>
  )
}
