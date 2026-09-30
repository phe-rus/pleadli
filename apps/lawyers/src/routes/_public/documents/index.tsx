import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { documentKindLabel, documentsOptions, useDocuments, VerifyCard, type DocumentSummary } from '@/features/documents'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/documents/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...documentsOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Every document you have drafted or filed. A document is started from a matter,
 * so this page finds them and does not create them. */
function RouteComponent() {
  const { data: documents } = useDocuments()

  const columns: DataTableColumnDef<DocumentSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link to="/documents/$documentId" params={{ documentId: row.original.id }} className={cn('inline-block rounded-md bg-primary/15 px-3 py-1 text-xs')}>
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: 'reference', header: 'Reference', cell: ({ row }) => row.original.reference ?? '·' },
      { accessorKey: 'title', header: 'Title' },
      { accessorKey: 'kind', header: 'Kind', cell: ({ row }) => documentKindLabel(row.original.kind) },
      {
        id: 'matter',
        header: 'Matter',
        accessorFn: (row) => `${row.courtNumber ?? ''} ${row.matterTitle}`,
        cell: ({ row }) => (
          <Link to="/matters/$matterId" params={{ matterId: row.original.matterId }} className="text-foreground">
            {row.original.courtNumber ?? row.original.matterTitle}
          </Link>
        ),
      },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => (row.original.status === 'filed' ? <Tag tone="done">Filed</Tag> : <Tag tone="open">Draft</Tag>) },
      { accessorKey: 'filedOn', header: 'Filed on', cell: ({ row }) => (row.original.filedOn ? format(row.original.filedOn, 'PP') : '·') },
      { accessorKey: 'updatedAt', header: 'Last changed', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Documents</h1>
          <p>What you have drafted and filed. A filed document is frozen: it can be printed and replaced, never edited.</p>
        </div>
      </header>

      <div className="md:max-w-xl">
        <VerifyCard />
      </div>

      {documents.length === 0 ? (
        <EmptyNote>No document has been drafted yet. Open a matter and choose Draft a document.</EmptyNote>
      ) : (
        <DataTable aria-label="Documents" data={documents} columns={columns} getRowId={(row) => row.id} emptyMessage="No documents." searchPlaceholder="Search documents" />
      )}
    </article>
  )
}
