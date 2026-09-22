import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { FileStatusTag, Tag } from '@/components/status-tag'
import {
  fileReference,
  fileViews,
  filesOptions,
  isFileView,
  ProsecutionFileForm,
  useFiles,
  type FileSummary,
  type FileViewId,
} from '@/features/prosecution-files'
import { ageLabel } from '@/lib/present'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useEffect, useMemo } from 'react'

export const Route = createFileRoute('/_public/files/')({
  validateSearch: (search: Record<string, unknown>): { view?: FileViewId; open?: string } => ({
    ...(isFileView(search.view) ? { view: search.view } : {}),
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
  }),
  loaderDeps: ({ search }) => ({ view: search.view ?? 'intake' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...filesOptions(deps.view), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Finding a prosecution file. One page, one view per slice of the register:
 * what has just arrived, what is under review, what is with Police, what is
 * concluded. Doing the work happens in the file's own workspace and in the
 * work areas, not here. */
function RouteComponent() {
  const { view = 'intake', open } = Route.useSearch()
  const navigate = useNavigate()
  const current = fileViews.find((v) => v.id === view) ?? fileViews[0]
  const { data: files } = useFiles(view)
  const waiting = view === 'intake' || view === 'active' || view === 'returned'

  // A link from search or the Overview may name a file to open.
  useEffect(() => {
    if (open) void navigate({ to: '/files/$fileId', params: { fileId: open }, replace: true })
  }, [open, navigate])

  const columns: DataTableColumnDef<FileSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link to="/files/$fileId" params={{ fileId: row.original.id }} className={cn('inline-block rounded-md bg-primary/15 px-3 py-1 text-xs')}>
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: 'title', header: 'Title', cell: ({ row }) => <span className="inline-block max-w-sm truncate">{row.original.title}</span> },
      { id: 'reference', header: 'Reference', accessorFn: (row) => fileReference(row), cell: ({ row }) => fileReference(row.original) },
      { accessorKey: 'accused', header: 'Accused', cell: ({ row }) => row.original.accused ?? '·' },
      { accessorKey: 'policeStation', header: 'Police station', cell: ({ row }) => row.original.policeStation ?? '·' },
      { accessorKey: 'currentStatus', header: 'Status', cell: ({ row }) => <FileStatusTag status={row.original.currentStatus} /> },
      ...(waiting
        ? [
            {
              id: 'waiting',
              header: view === 'returned' ? 'With Police' : 'Waiting',
              accessorFn: (row: FileSummary) => row.awaitingSince,
              cell: ({ row }: { row: { original: FileSummary } }) => ageLabel(view === 'returned' ? (row.original.lastDecisionAt ?? row.original.awaitingSince) : row.original.awaitingSince),
            } satisfies DataTableColumnDef<FileSummary>,
          ]
        : []),
      { accessorKey: 'courtCaseNumber', header: 'Court case no.', cell: ({ row }) => row.original.courtCaseNumber ?? '·' },
      { accessorKey: 'receivedAt', header: 'Received', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
      { accessorKey: 'createdAt', header: 'Recorded', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ],
    [view, waiting],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{current.label}</h1>
          <p>{current.about}</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Open a file" title="Open a file" description="Log a matter referred by Police." variant="default">
            {({ close, setDirty }) => <ProsecutionFileForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <nav aria-label="Views of the register" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {fileViews.map((item) => (
          <Link
            key={item.id}
            to="/files"
            search={{ view: item.id }}
            replace
            aria-current={item.id === view ? 'page' : undefined}
            className={cn(
              'relative shrink-0 px-3 py-1.5 no-underline',
              item.id === view ? 'text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {files.length === 0 ? (
        <EmptyNote>{emptyText[view] ?? 'No files here.'}</EmptyNote>
      ) : (
        <DataTable aria-label={current.label} data={files} columns={columns} getRowId={(row) => row.id} emptyMessage="No files here." searchPlaceholder="Search this list" />
      )}
      {view === 'intake' && files.length > 0 && <Tag tone="open" className="w-fit">Oldest first</Tag>}
    </article>
  )
}

const emptyText: Partial<Record<FileViewId, string>> = {
  reopened: 'No decision is being reopened.',
  intake: 'Nothing has arrived that is still waiting for a first review.',
  active: 'No file is being reviewed.',
  returned: 'No file is with Police.',
  closed: 'No charging decision has been made yet.',
  all: 'No files have been opened yet.',
}
