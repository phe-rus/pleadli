import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { caseViews, casesOptions, CaseForm, courtLevelLabel, isCaseView, useCases, type CaseSummary, type CaseViewId } from '@/features/cases'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

export const Route = createFileRoute('/_public/cases/')({
  validateSearch: (search: Record<string, unknown>): { view?: CaseViewId } => (isCaseView(search.view) ? { view: search.view } : {}),
  loaderDeps: ({ search }) => ({ view: search.view ?? 'open' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...casesOptions(deps.view), staleTime: 'static' })
  },
  component: RouteComponent,
})

const emptyText: Record<CaseViewId, string> = {
  open: 'No case is open. Register a case to begin.',
  unscheduled: 'Every open case has a next sitting fixed.',
  concluded: 'No case has been concluded yet.',
  all: 'No case has been registered yet.',
}

/** The register of cases held here. One page, one view per slice: what is open,
 * what has no next date, what is concluded. Doing the work happens in a case's
 * own workspace and on the cause list. */
function RouteComponent() {
  const { view = 'open' } = Route.useSearch()
  const navigate = useNavigate()
  const current = caseViews.find((v) => v.id === view) ?? caseViews[0]
  const { data: cases } = useCases(view)

  const columns: DataTableColumnDef<CaseSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <Link to="/cases/$caseId" params={{ caseId: row.original.id }} className={cn('inline-block rounded-md bg-primary/15 px-3 py-1 text-xs')}>
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: 'courtNumber', header: 'Court number' },
      { accessorKey: 'title', header: 'Title', cell: ({ row }) => <span className="inline-block max-w-sm truncate">{row.original.title}</span> },
      { accessorKey: 'accused', header: 'Accused', cell: ({ row }) => row.original.accused ?? '·' },
      { accessorKey: 'offence', header: 'Offence', cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.offence ?? '·'}</span> },
      { accessorKey: 'courtLevel', header: 'Court', cell: ({ row }) => courtLevelLabel(row.original.courtLevel) },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (row.original.status === 'concluded' ? <Tag tone="done">Concluded</Tag> : row.original.nextSittingAt ? <Tag tone="open">Open</Tag> : <Tag tone="urgent">No next date</Tag>),
      },
      { accessorKey: 'nextSittingAt', header: 'Next sitting', cell: ({ row }) => (row.original.nextSittingAt ? format(row.original.nextSittingAt, 'PPp') : '·') },
      { accessorKey: 'adjournments', header: 'Adjournments' },
      { accessorKey: 'outcome', header: 'Outcome', cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.outcome ?? '·'}</span> },
      { accessorKey: 'createdAt', header: 'Recorded', cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
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
          <PanelButton label="Register a case" title="Register a case" description="Record a criminal case the court registry has numbered." variant="default">
            {({ close, setDirty }) => (
              <CaseForm
                onDirtyChange={setDirty}
                onSuccess={(record) => {
                  close()
                  void navigate({ to: '/cases/$caseId', params: { caseId: record.id } })
                }}
              />
            )}
          </PanelButton>
        </div>
      </header>

      <nav aria-label="Views of the register" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-border/60">
        {caseViews.map((item) => (
          <Link
            key={item.id}
            to="/cases"
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

      {cases.length === 0 ? (
        <EmptyNote>{emptyText[view]}</EmptyNote>
      ) : (
        <DataTable aria-label={current.label} data={cases} columns={columns} getRowId={(row) => row.id} emptyMessage="No cases here." searchPlaceholder="Search this list" />
      )}
    </article>
  )
}
