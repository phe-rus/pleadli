import { useVisits, allVisitsOptions, visitTypeLabel, visitStatusLabel } from '@/features/visits'
import { visitListItemFullName } from '@/features/visits'
import type { VisitListItem } from '@/features/visits'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/visits/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...allVisitsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Visits, standalone (docs/prisons/navigation.md §4.5) — the facility-wide
 * visit log: the same authorization/attendance ledger that lives inside
 * each prisoner's workspace, but findable without opening a prisoner,
 * exactly as Requests already is. Prisoner IDs link through to the person;
 * every visit row here is a real record, not a summary.
 */
function RouteComponent() {
  const { data: visits } = useVisits()

  const columns: DataTableColumnDef<VisitListItem>[] = useMemo(() => {
    return [
      {
        accessorKey: 'prisonerId',
        header: 'Prisoner ID',
        cell: ({ row }) => (
          <Link
            to="/prisoners/$prisonerId"
            params={{ prisonerId: row.original.prisonerId }}
            className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'inline-block')}
          >
            {row.original.prisonerId}
          </Link>
        ),
      },
      {
        id: 'prisoner',
        accessorFn: (row) => visitListItemFullName(row),
        header: 'Prisoner',
      },
      { accessorKey: 'visitorName', header: 'Visitor' },
      {
        accessorKey: 'visitType',
        header: 'Type',
        cell: ({ getValue }) => <Badge variant="outline">{visitTypeLabel(getValue<string>())}</Badge>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue<string>()
          const variant = status === 'attended' ? 'default' : status === 'denied' ? 'destructive' : 'secondary'
          return <Badge variant={variant}>{visitStatusLabel(status)}</Badge>
        },
      },
      {
        accessorKey: 'visitedAt',
        header: 'Visited',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
      {
        accessorKey: 'supervisingOfficer',
        header: 'Supervising officer',
        cell: ({ getValue }) => getValue<string>() ?? '·',
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Visits</h1>
        <p className="md:max-w-sm">Every visit at this facility — authorized and attended separate, per the grounded visit procedure.</p>
      </section>

      <DataTable
        aria-label="Visits"
        data={visits}
        columns={columns}
        getRowId={(row) => row.id}
        emptyMessage="No visits recorded yet."
        searchPlaceholder="Search visits by visitor or prisoner…"
      />
    </article>
  )
}