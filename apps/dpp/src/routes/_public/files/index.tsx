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
import { boardOptions, CaseBoard } from '@/features/pipeline'
import { Folder01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'

export const Route = createFileRoute('/_public/files/')({
  validateSearch: (search: Record<string, unknown>): { view?: FileViewId; open?: string; layout?: 'list' | 'board' } => ({
    ...(isFileView(search.view) ? { view: search.view } : {}),
    ...(typeof search.open === 'string' ? { open: search.open } : {}),
    ...(search.layout === 'board' ? { layout: 'board' as const } : {}),
  }),
  loaderDeps: ({ search }) => ({ view: search.view ?? 'all' }),
  loader: async ({ context, deps }) => {
    await Promise.all([context.queryClient.query({ ...filesOptions(deps.view), staleTime: 'static' }), context.queryClient.query({ ...boardOptions(), staleTime: 'static' })])
  },
  component: RouteComponent,
})

/** One folder of files, chosen in the sidebar: every file, the files at one
 * stage, or those back with Police. All files can also be seen as a board of
 * the stages. Doing the work happens in the file itself, not here. */
function RouteComponent() {
  const { view = 'all', open, layout = 'list' } = Route.useSearch()
  const navigate = useNavigate()
  const current = fileViews.find((v) => v.id === view) ?? fileViews[0]
  const { data: files } = useFiles(view)
  const waiting = view === 'intake' || view === 'active' || view === 'returned'
  const board = view === 'all' && layout === 'board'

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
    <article className={cn('page', board && 'flex min-h-0 flex-1 flex-col')}>
      <header className="page-header">
        <div>
          <h1>{current.label}</h1>
          <p>
            {files.length === 1 ? m["files.count_one"]() : m["files.count"]({ count: files.length })} · {current.about}
          </p>
        </div>
        <div className="page-actions">
          {view === 'all' && (
            <div role="radiogroup" aria-label={m["files.layout.label"]()} className="flex rounded-lg bg-foreground/[0.05] p-0.5">
              {(['list', 'board'] as const).map((id) => (
                <Link
                  key={id}
                  to="/files"
                  search={{ view: 'all', ...(id === 'board' ? { layout: 'board' as const } : {}) }}
                  replace
                  role="radio"
                  aria-checked={layout === id}
                  className={cn('rounded-md px-3 py-1 text-[0.8125rem] no-underline transition-colors', layout === id ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                >
                  {id === 'list' ? m["files.layout.list"]() : m["files.layout.board"]()}
                </Link>
              ))}
            </div>
          )}
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

      {board ? (
        <CaseBoard />
      ) : files.length === 0 ? (
        <EmptyNote icon={<HugeiconsIcon icon={Folder01Icon} />}>{emptyText[view]?.() ?? m["page.files.empty"]()}</EmptyNote>
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
