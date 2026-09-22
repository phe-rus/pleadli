import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { engagementLabel, isMatterView, levelLabel, MatterForm, matterViews, mattersOptions, useMatters, type MatterSummary, type MatterViewId } from '@/features/matters'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/matters/')({
  validateSearch: (search: Record<string, unknown>): { view?: MatterViewId } => (isMatterView(search.view) ? { view: search.view } : {}),
  loaderDeps: ({ search }) => ({ view: search.view ?? 'open' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...mattersOptions(deps.view), staleTime: 'static' })
  },
  component: RouteComponent,
})

const emptyText: Record<MatterViewId, string> = {
  open: 'You are not acting in any matter yet. Open one to begin.',
  no_hearing: 'Every open matter has a hearing listed.',
  closed: 'No matter has been closed yet.',
  all: 'No matter has been opened yet.',
}

/** Every matter, one page and one view per slice. Doing the work happens in a
 * matter's own workspace and in the diary. */
function RouteComponent() {
  const { view = 'open' } = Route.useSearch()
  const navigate = useNavigate()
  const current = matterViews.find((v) => v.id === view) ?? matterViews[0]
  const { data: matters } = useMatters(view)

  const columns: DataTableColumnDef<MatterSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link to="/matters/$matterId" params={{ matterId: row.original.id }} className={cn('inline-block rounded-md bg-primary/15 px-3 py-1 text-xs')}>
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: 'title', header: 'Title', cell: ({ row }) => <span className="inline-block max-w-sm truncate">{row.original.title}</span> },
      { accessorKey: 'clientName', header: 'Client' },
      { accessorKey: 'ourRef', header: 'Your reference', cell: ({ row }) => row.original.ourRef ?? '·' },
      { accessorKey: 'courtNumber', header: 'Court number', cell: ({ row }) => row.original.courtNumber ?? '·' },
      { accessorKey: 'courtName', header: 'Court', cell: ({ row }) => row.original.courtName ?? (row.original.courtLevel ? levelLabel(row.original.courtLevel) : '·') },
      { accessorKey: 'offence', header: 'Offence', cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.offence ?? '·'}</span> },
      { accessorKey: 'engagement', header: 'Acting', cell: ({ row }) => engagementLabel(row.original.engagement) },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (row.original.status === 'closed' ? <Tag tone="done">Closed</Tag> : row.original.nextHearingAt ? <Tag tone="open">Open</Tag> : <Tag tone="urgent">No hearing listed</Tag>),
      },
      { accessorKey: 'nextHearingAt', header: 'Next hearing', cell: ({ row }) => (row.original.nextHearingAt ? format(row.original.nextHearingAt, 'PPp') : '·') },
      { accessorKey: 'openTasks', header: 'Open tasks' },
      { accessorKey: 'outcome', header: 'Outcome', cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.outcome ?? '·'}</span> },
      { accessorKey: 'createdAt', header: 'Opened', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
    ],
    [],
  )

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{current.label}</h1>
          <p>{current.about}</p>
        </div>
        <div className="page-actions">
          <PanelButton label="Open a matter" title="Open a matter" description="A client, and the matter you are acting in for them." variant="default">
            {({ close, setDirty }) => (
              <MatterForm
                onDirtyChange={setDirty}
                onSuccess={(matter) => {
                  close()
                  void navigate({ to: '/matters/$matterId', params: { matterId: matter.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>

      <nav aria-label="Views of the matters" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {matterViews.map((item) => (
          <Link
            key={item.id}
            to="/matters"
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

      {matters.length === 0 ? (
        <EmptyNote>{emptyText[view]}</EmptyNote>
      ) : (
        <DataTable aria-label={current.label} data={matters} columns={columns} getRowId={(row) => row.id} emptyMessage="No matters here." searchPlaceholder="Search this list" />
      )}
    </article>
  )
}
