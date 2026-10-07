import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { matterTypeLabel, stageLabel, useEnabledMatterTypes, useMatterTypes } from '@/features/matter-types'
import { engagementLabel, isMatterView, levelLabel, MatterBoard, MatterForm, matterViews, mattersOptions, useMatters, type MatterSummary, type MatterViewId } from '@/features/matters'
import * as m from '@/paraglide/messages'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { cn } from '@pleadli/ui/lib/utils'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo } from 'react'

type Search = { view?: MatterViewId; type?: string }

export const Route = createFileRoute('/_public/matters/')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(isMatterView(search.view) ? { view: search.view } : {}),
    ...(typeof search.type === 'string' ? { type: search.type } : {}),
  }),
  loaderDeps: ({ search }) => ({ view: search.view ?? 'open' }),
  loader: async ({ context, deps }) => {
    await context.queryClient.query({ ...mattersOptions(deps.view), staleTime: 'static' })
  },
  component: RouteComponent,
})

const emptyText: Record<MatterViewId, () => string> = {
  board: () => m["matter.empty.open"](),
  open: () => m["matter.empty.open"](),
  no_hearing: () => m["matter.empty.no_hearing"](),
  closed: () => m["matter.empty.closed"](),
  all: () => m["matter.empty.all"](),
}

/** Every matter: the board (one kind of matter, a column per stage) or a list
 * per slice. The work itself happens in a matter's own workspace. */
function RouteComponent() {
  const { view = 'open', type } = Route.useSearch()
  const navigate = useNavigate()
  // The board is open matters seen another way, so it keeps their name.
  const current = matterViews.find((v) => v.id === (view === 'board' ? 'open' : view)) ?? matterViews[0]
  const { data: matters } = useMatters(view)
  const enabled = useEnabledMatterTypes()
  const { data: allTypes } = useMatterTypes()
  // The board shows one kind at a time: the one chosen, else the first with
  // open matters, else the first the practice does.
  const boardTypes = useMemo(() => {
    const withMatters = (allTypes ?? []).filter((ty) => matters.some((x) => x.matterType === ty.id))
    return [...enabled, ...withMatters.filter((ty) => !enabled.some((e) => e.id === ty.id))]
  }, [enabled, allTypes, matters])
  const boardType = boardTypes.find((ty) => ty.id === type) ?? boardTypes.find((ty) => matters.some((x) => x.matterType === ty.id)) ?? boardTypes[0]

  const columns: DataTableColumnDef<MatterSummary>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'title',
        header: m["matter.col.title"](),
        cell: ({ row }) => {
          const refs = [row.original.courtNumber, row.original.ourRef].filter(Boolean).join(' · ')
          return (
            <Link to="/matters/$matterId" params={{ matterId: row.original.id }} className="flex max-w-md flex-col no-underline">
              <span className="truncate font-medium text-foreground">{row.original.title}</span>
              {refs && <span className="truncate text-muted-foreground">{refs}</span>}
            </Link>
          )
        },
      },
      { accessorKey: 'matterType', header: m["matter.col.type"](), cell: ({ row }) => matterTypeLabel(row.original.matterType) },
      { accessorKey: 'stage', header: m["matter.col.stage"](), cell: ({ row }) => stageLabel(row.original.stage) },
      { accessorKey: 'clientName', header: m["matter.col.client"]() },
      { accessorKey: 'ourRef', header: m["matter.col.our_ref"](), cell: ({ row }) => row.original.ourRef ?? '·' },
      { accessorKey: 'courtNumber', header: m["matter.col.court_number"](), cell: ({ row }) => row.original.courtNumber ?? '·' },
      { accessorKey: 'courtName', header: m["matter.col.court"](), cell: ({ row }) => row.original.courtName ?? (row.original.courtLevel ? levelLabel(row.original.courtLevel) : '·') },
      { accessorKey: 'offence', header: m["matter.col.offence"](), cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.offence ?? '·'}</span> },
      { accessorKey: 'engagement', header: m["matter.col.acting"](), cell: ({ row }) => engagementLabel(row.original.engagement) },
      {
        accessorKey: 'status',
        header: m["matter.col.status"](),
        cell: ({ row }) =>
          row.original.status === 'closed' ? <Tag tone="done">{m["matter.status.closed"]()}</Tag> : <Tag tone="open">{m["matter.status.open"]()}</Tag>,
      },
      { accessorKey: 'nextHearingAt', header: m["matter.col.next_hearing"](), cell: ({ row }) => (row.original.nextHearingAt ? format(row.original.nextHearingAt, 'PPp') : '·') },
      { accessorKey: 'openTasks', header: m["matter.col.open_tasks"]() },
      { accessorKey: 'outcome', header: m["matter.col.outcome"](), cell: ({ row }) => <span className="inline-block max-w-xs truncate">{row.original.outcome ?? '·'}</span> },
      { accessorKey: 'createdAt', header: m["matter.col.opened"](), cell: ({ getValue }) => format(getValue<number>(), 'PPp') },
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
          <PanelButton label={m["matter.open_a_matter"]()} title={m["matter.open_a_matter"]()} description={m["matter.open_a_matter_about"]()} variant="default">
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

      {(view === 'open' || view === 'board') && (
        <Segmented
          label={m["matter.views"]()}
          value={view}
          items={[
            { value: 'open', label: m["workspace.view.list"]() },
            { value: 'board', label: m["workspace.view.board"]() },
          ]}
          render={(item, props) => (
            <Link key={item.value} to="/matters" search={{ view: item.value }} replace className={props.className} role={props.role} aria-selected={props['aria-selected']}>
              {props.children}
            </Link>
          )}
          className="self-start"
        />
      )}

      {view === 'board' ? (
        boardType ? (
          <>
            {boardTypes.length > 1 && (
              <nav aria-label={m["board.kinds"]()} className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {boardTypes.map((ty) => {
                  const count = matters.filter((x) => x.matterType === ty.id).length
                  return (
                    <Link
                      key={ty.id}
                      to="/matters"
                      search={{ view: 'board', type: ty.id }}
                      replace
                      aria-current={ty.id === boardType.id ? 'page' : undefined}
                      className={cn(
                        'shrink-0 rounded-full border px-3 py-1 no-underline',
                        ty.id === boardType.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {matterTypeLabel(ty.id)} <span className="tabular-nums opacity-70">{count}</span>
                    </Link>
                  )
                })}
              </nav>
            )}
            <MatterBoard type={boardType} matters={matters} />
          </>
        ) : (
          <EmptyNote>{m["matter.form.no_types"]()}</EmptyNote>
        )
      ) : matters.length === 0 ? (
        <EmptyNote>{emptyText[view]()}</EmptyNote>
      ) : (
        <DataTable aria-label={current.label} data={matters} columns={columns} getRowId={(row) => row.id} initialHidden={['id', 'ourRef', 'courtNumber', 'offence', 'engagement', 'outcome', 'openTasks', 'createdAt']} emptyMessage={m["matter.empty.list"]()} searchPlaceholder={m["matter.search_list"]()} />
      )}
    </article>
  )
}
