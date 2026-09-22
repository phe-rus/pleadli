import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { rulingKindLabel, rulingsOptions, useRulings, type RulingSummary } from '@/features/rulings'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/rulings/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...rulingsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Every ruling and judgment, drafted or delivered. A decision is started from a
 * case or a sitting, so this page finds them and does not create them. */
function RouteComponent() {
  const { data: rulings } = useRulings()

  const columns: DataTableColumnDef<RulingSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link to="/rulings/$rulingId" params={{ rulingId: row.original.id }} className={cn('inline-block rounded-md bg-primary/15 px-3 py-1 text-xs')}>
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: 'reference', header: 'Reference', cell: ({ row }) => row.original.reference ?? '·' },
      { accessorKey: 'title', header: 'Title' },
      { accessorKey: 'kind', header: 'Kind', cell: ({ row }) => rulingKindLabel(row.original.kind) },
      {
        id: 'case',
        header: 'Case',
        accessorFn: (row) => `${row.courtNumber} ${row.caseTitle}`,
        cell: ({ row }) => (
          <Link to="/cases/$caseId" params={{ caseId: row.original.caseId }} className="text-foreground">
            {row.original.courtNumber}
          </Link>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (row.original.status === 'delivered' ? <Tag tone="done">Delivered</Tag> : row.original.reservedOn ? <Tag tone="urgent">Reserved</Tag> : <Tag tone="open">Draft</Tag>),
      },
      { accessorKey: 'reservedOn', header: 'Reserved on', cell: ({ row }) => (row.original.reservedOn ? format(row.original.reservedOn, 'PP') : '·') },
      { accessorKey: 'deliveredOn', header: 'Delivered on', cell: ({ row }) => (row.original.deliveredOn ? format(row.original.deliveredOn, 'PP') : '·') },
      { accessorKey: 'updatedAt', header: 'Last changed', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Rulings and judgments</h1>
          <p>The court&rsquo;s reasoned decisions. A delivered decision is frozen: it can be printed and replaced, never edited.</p>
        </div>
      </header>

      {rulings.length === 0 ? (
        <EmptyNote>No decision has been drafted yet. Open a sitting or a case and choose Draft a decision.</EmptyNote>
      ) : (
        <DataTable aria-label="Rulings and judgments" data={rulings} columns={columns} getRowId={(row) => row.id} emptyMessage="No decisions." searchPlaceholder="Search decisions" />
      )}
    </article>
  )
}
