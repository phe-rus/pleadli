import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { orderKindLabel, ordersOptions, useOrders, type OrderSummary } from '@/features/orders'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/orders/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...ordersOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Every order the court has drafted or issued. An order is drafted from a case
 * (or from an adjourned sitting), so this page finds them and does not create
 * them. */
function RouteComponent() {
  const { data: orders } = useOrders()

  const columns: DataTableColumnDef<OrderSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link to="/orders/$orderId" params={{ orderId: row.original.id }} className={cn('inline-block rounded-md bg-primary/15 px-3 py-1 text-xs')}>
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: 'reference', header: 'Reference', cell: ({ row }) => row.original.reference ?? '·' },
      { accessorKey: 'title', header: 'Title' },
      { accessorKey: 'kind', header: 'Kind', cell: ({ row }) => orderKindLabel(row.original.kind) },
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
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => (row.original.status === 'issued' ? <Tag tone="done">Issued</Tag> : <Tag tone="open">Draft</Tag>) },
      { accessorKey: 'issuedAt', header: 'Issued', cell: ({ row }) => (row.original.issuedAt ? format(row.original.issuedAt, 'PPp') : '·') },
      { accessorKey: 'updatedAt', header: 'Last changed', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Orders</h1>
          <p>Orders drafted and issued by this court. An issued order is frozen: it can be printed and replaced, never edited.</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <EmptyNote>No order has been drafted yet. Open a case and choose Draft an order, or adjourn a sitting and draft the order from it.</EmptyNote>
      ) : (
        <DataTable aria-label="Orders" data={orders} columns={columns} getRowId={(row) => row.id} emptyMessage="No orders." searchPlaceholder="Search orders" />
      )}
    </article>
  )
}
