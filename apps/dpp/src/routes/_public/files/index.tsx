import * as m from '@/paraglide/messages'
import { formatDate } from '@/lib/dates'
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

  const columns: DataTableColumnDef<FileSummary>[] = useMemo<DataTableColumnDef<FileSummary>[]>(() => {
    const waitingColumn: DataTableColumnDef<FileSummary>[] = waiting
      ? [
          {
            id: 'waiting',
            header: () => (view === 'returned' ? m["page.files.col.with_police"]() : m["page.files.col.waiting"]()),
            accessorFn: (row: FileSummary) => row.awaitingSince,
            cell: ({ row }: { row: { original: FileSummary } }) => ageLabel(view === 'returned' ? (row.original.lastDecisionAt ?? row.original.awaitingSince) : row.original.awaitingSince),
          },
        ]
      : []
    return [
      selectColumn(),
      {
        accessorKey: 'title',
        header: () => m["page.files.col.title"](),
        cell: ({ row }) => (
          <Link to="/files/$fileId" params={{ fileId: row.original.id }} className="flex max-w-md flex-col no-underline">
            <span className="truncate font-medium text-foreground">{row.original.title}</span>
            <span className="truncate text-muted-foreground">{fileReference(row.original)}</span>
          </Link>
        ),
      },
      { accessorKey: 'id', header: () => m["page.files.col.id"]() },
      { id: 'reference', header: () => m["page.files.col.reference"](), accessorFn: (row) => fileReference(row), cell: ({ row }) => fileReference(row.original) },
      { accessorKey: 'accused', header: () => m["page.files.col.accused"](), cell: ({ row }) => row.original.accused ?? '·' },
      { accessorKey: 'policeStation', header: () => m["page.files.col.station"](), cell: ({ row }) => row.original.policeStation ?? '·' },
      { accessorKey: 'currentStatus', header: () => m["page.files.col.status"](), cell: ({ row }) => <FileStatusTag status={row.original.currentStatus} /> },
      ...waitingColumn,
      { accessorKey: 'courtCaseNumber', header: () => m["page.files.col.court"](), cell: ({ row }) => row.original.courtCaseNumber ?? '·' },
      { accessorKey: 'receivedAt', header: () => m["page.files.col.received"](), cell: ({ getValue }) => formatDate(getValue<number>(), 'datetime') },
      { accessorKey: 'createdAt', header: () => m["page.files.col.recorded"](), cell: ({ getValue }) => formatDate(getValue<number>(), 'datetime') },
    ]
  }, [view, waiting])

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{current.label}</h1>
          <p>{current.about}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["workspace.quick.open_file"]()} title={m["workspace.quick.open_file"]()} description={m["workspace.quick.open_file_description"]()} variant="default">
            {({ close, setDirty }) => (
              <ProsecutionFileForm
                onDirtyChange={setDirty}
                onSuccess={(file) => {
                  close()
                  // A new file opens straight away, on its (empty) folder, ready for the paper.
                  void navigate({ to: '/files/$fileId', params: { fileId: file.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>

      <nav aria-label={m["page.files.views"]()} className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
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
        <EmptyNote>{emptyText[view]?.() ?? m["page.files.empty"]()}</EmptyNote>
      ) : (
        <DataTable aria-label={current.label} data={files} columns={columns} getRowId={(row) => row.id} initialHidden={['id', 'reference', 'createdAt']} emptyMessage={m["page.files.empty"]()} searchPlaceholder={m["page.files.search_list"]()} />
      )}
      {view === 'intake' && files.length > 0 && <Tag tone="open" className="w-fit">{m["page.files.oldest_first"]()}</Tag>}
    </article>
  )
}

const emptyText: Partial<Record<FileViewId, () => string>> = {
  reopened: m["page.files.empty_reopened"],
  intake: m["page.files.empty_intake"],
  active: m["page.files.empty_active"],
  returned: m["page.files.empty_returned"],
  closed: m["page.files.empty_closed"],
  all: m["page.files.empty_all"],
}
